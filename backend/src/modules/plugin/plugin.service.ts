import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { Pool, PoolClient, PoolConfig } from 'pg';

import { CreatePluginIssueDto, thumbnailContentTypeValues } from './dto/create-plugin-issue.dto';
import { ListPluginProjectsDto } from './dto/list-plugin-projects.dto';
import { CompleteThumbnailDto } from './dto/complete-thumbnail.dto';
import { pluginError } from './plugin.errors';
import { PluginStorageService } from './plugin-storage.service';

type PatRow = {
    id: string;
    orgId: string;
    userId: string;
    scopes: string[];
    expiresAt: Date;
};

type PatContext = {
    id: string;
    orgId: string;
    userId: string;
    scopes: string[];
    expiresAt: string;
};

type IdempotencyRow = {
    requestHash: string;
    responseBody: unknown;
    responseStatus: number;
};

type IssueInsertRow = {
    id: string;
    title: string;
    status: string;
    version: number;
};

type IssueAccessRow = {
    id: string;
    projectId: string;
    orgId: string;
    thumbnailKey: string | null;
};

const pluginWriteRoles = new Set(['PROJECT_MEMBER', 'PROJECT_ADMIN']);
const validIdempotencyKeyPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class PluginService {
    private readonly pool: Pool;
    private readonly maxThumbnailSizeBytes = 5 * 1024 * 1024;
    private readonly idempotencyWindowMs = 24 * 60 * 60 * 1000;
    private readonly uploadUrlTtlSeconds = Number.parseInt(
        process.env.PLUGIN_UPLOAD_URL_TTL_SECONDS ?? '300',
        10,
    );

    constructor(private readonly pluginStorageService: PluginStorageService) {
        this.pool = new Pool(this.buildPoolConfig());
    }

    async verifyPat(authorizationHeader?: string) {
        const pat = await this.requirePat(authorizationHeader);

        return {
            userId: pat.userId,
            orgId: pat.orgId,
            scopes: pat.scopes,
            expiresAt: pat.expiresAt,
        };
    }

    async listProjects(authorizationHeader: string | undefined, query: ListPluginProjectsDto) {
        const pat = await this.requirePat(authorizationHeader, 'plugin:read_projects');

        if (query.orgId !== pat.orgId) {
            throw pluginError.forbidden('ORG_MISMATCH', 'PAT cannot access this organization', {
                requestedOrgId: query.orgId,
                patOrgId: pat.orgId,
            });
        }

        const result = await this.pool.query<{
            id: string;
            name: string;
            role: string;
        }>(
            `
                SELECT p.id, p.name, pm.role
                FROM "ProjectMembership" pm
                JOIN "Project" p ON p.id = pm."projectId"
                WHERE pm."userId" = $1
                  AND p."orgId" = $2
                ORDER BY p.name ASC
            `,
            [pat.userId, pat.orgId],
        );

        return {
            projects: result.rows.map((project) => ({
                id: project.id,
                name: project.name,
                role: project.role,
            })),
        };
    }

    async createIssue(
        authorizationHeader: string | undefined,
        idempotencyKey: string | undefined,
        payload: CreatePluginIssueDto,
    ) {
        if (!idempotencyKey || !validIdempotencyKeyPattern.test(idempotencyKey)) {
            throw pluginError.badRequest(
                'VALIDATION_ERROR',
                'Idempotency-Key header is required and must be a UUID',
            );
        }

        const pat = await this.requirePat(authorizationHeader, 'plugin:write_issues');
        const idempotencyHash = this.sha256(idempotencyKey.trim());
        const requestHash = this.sha256(this.stableStringify(payload));
        const issueId = this.generateId('iss');
        const objectKey = this.buildThumbnailObjectKey(
            pat.orgId,
            payload.projectId,
            issueId,
            payload.thumbnail.contentType,
        );

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
                `plugin-issue:${pat.id}:${idempotencyHash}`,
            ]);

            const existing = await this.findActiveIdempotencyRecord(client, pat.id, idempotencyHash);

            if (existing) {
                if (existing.requestHash !== requestHash) {
                    throw pluginError.conflict(
                        'IDEMPOTENCY_KEY_REUSED',
                        'Idempotency key was reused with a different payload',
                    );
                }

                await client.query('COMMIT');
                return this.parseResponseBody(existing.responseBody);
            }

            await this.assertWritableProjectAccess(client, payload.projectId, pat.orgId, pat.userId);

            const figmaDeepLink = this.buildFigmaDeepLink(payload.figmaFileKey, payload.nodeId);

            const insertedIssue = await client.query<IssueInsertRow>(
                `
                    INSERT INTO "Issue" (
                        id,
                        "projectId",
                        title,
                        description,
                        status,
                        priority,
                        version,
                        "figmaFileKey",
                        "figmaNodeId",
                        "figmaNodeName",
                        "figmaDeepLink",
                        "thumbnailKey",
                        "createdAt",
                        "updatedAt"
                    ) VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        'TODO',
                        $5,
                        1,
                        $6,
                        $7,
                        $8,
                        $9,
                        $10,
                        NOW(),
                        NOW()
                    )
                    RETURNING id, title, status, version
                `,
                [
                    issueId,
                    payload.projectId,
                    payload.title,
                    payload.description ?? null,
                    payload.priority,
                    payload.figmaFileKey,
                    payload.nodeId,
                    payload.nodeName,
                    figmaDeepLink,
                    objectKey,
                ],
            );

            const issue = insertedIssue.rows[0];
            const upload = await this.pluginStorageService.createSignedUpload({
                objectKey,
                contentType: payload.thumbnail.contentType,
                sizeBytes: payload.thumbnail.sizeBytes,
                expiresInSeconds: this.safeUploadUrlTtlSeconds(),
            });
            const responseBody = {
                issue: {
                    id: issue.id,
                    title: issue.title,
                    status: issue.status,
                    version: issue.version,
                },
                upload,
            };

            await client.query(
                `
                    INSERT INTO "ActivityLog" (
                        id,
                        "projectId",
                        "actorId",
                        "entityType",
                        "entityId",
                        action,
                        payload,
                        "createdAt"
                    ) VALUES (
                        $1,
                        $2,
                        $3,
                        'ISSUE',
                        $4,
                        'ISSUE_CREATED',
                        $5::jsonb,
                        NOW()
                    )
                `,
                [
                    this.generateId('act'),
                    payload.projectId,
                    pat.userId,
                    issue.id,
                    JSON.stringify({
                        source: 'figma-plugin',
                        figmaFileKey: payload.figmaFileKey,
                        nodeId: payload.nodeId,
                    }),
                ],
            );

            await client.query(
                `
                    INSERT INTO "PluginIdempotencyRecord" (
                        id,
                        "patId",
                        "requestMethod",
                        "requestPath",
                        "idempotencyHash",
                        "requestHash",
                        "responseStatus",
                        "responseBody",
                        "createdAt",
                        "expiresAt"
                    ) VALUES (
                        $1,
                        $2,
                        'POST',
                        '/api/plugin/issues',
                        $3,
                        $4,
                        201,
                        $5::jsonb,
                        NOW(),
                        $6
                    )
                `,
                [
                    this.generateId('idem'),
                    pat.id,
                    idempotencyHash,
                    requestHash,
                    JSON.stringify(responseBody),
                    new Date(Date.now() + this.idempotencyWindowMs),
                ],
            );

            await client.query('COMMIT');
            return responseBody;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async completeThumbnail(
        authorizationHeader: string | undefined,
        issueId: string,
        payload: CompleteThumbnailDto,
    ) {
        const pat = await this.requirePat(authorizationHeader, 'plugin:write_issues');
        const objectKey = payload.objectKey.trim();

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            const issueResult = await client.query<IssueAccessRow>(
                `
                    SELECT i.id,
                           i."projectId",
                           i."thumbnailKey",
                           p."orgId"
                    FROM "Issue" i
                    JOIN "Project" p ON p.id = i."projectId"
                    WHERE i.id = $1
                    LIMIT 1
                `,
                [issueId],
            );

            if (!issueResult.rows[0]) {
                throw pluginError.notFound('ISSUE_NOT_FOUND', 'Issue was not found');
            }

            const issue = issueResult.rows[0];

            if (issue.orgId !== pat.orgId) {
                throw pluginError.forbidden('ORG_MISMATCH', 'PAT cannot access this issue organization');
            }

            await this.assertWritableProjectAccess(client, issue.projectId, pat.orgId, pat.userId);

            if (!issue.thumbnailKey) {
                throw pluginError.badRequest(
                    'THUMBNAIL_KEY_NOT_INITIALIZED',
                    'Issue does not have an expected thumbnail key',
                );
            }

            if (issue.thumbnailKey !== objectKey) {
                throw pluginError.badRequest(
                    'THUMBNAIL_KEY_MISMATCH',
                    'objectKey must match the key returned during issue creation',
                    {
                        expectedObjectKey: issue.thumbnailKey,
                        receivedObjectKey: objectKey,
                    },
                );
            }

            const expectedPrefix = `org/${pat.orgId}/project/${issue.projectId}/issue/${issue.id}/thumb.`;
            if (!objectKey.startsWith(expectedPrefix)) {
                throw pluginError.badRequest(
                    'THUMBNAIL_KEY_MISMATCH',
                    'objectKey prefix is invalid for this issue',
                    { expectedPrefix },
                );
            }

            const metadata = await this.pluginStorageService.headObject(objectKey);

            if (!new Set<string>(thumbnailContentTypeValues).has(metadata.contentType)) {
                throw pluginError.badRequest(
                    'THUMBNAIL_INVALID_TYPE',
                    'Uploaded thumbnail content type is not allowed',
                    {
                        allowed: thumbnailContentTypeValues,
                        received: metadata.contentType,
                    },
                );
            }

            if (metadata.sizeBytes > this.maxThumbnailSizeBytes) {
                throw pluginError.badRequest(
                    'THUMBNAIL_TOO_LARGE',
                    'Uploaded thumbnail size exceeds max allowed size',
                    {
                        maxBytes: this.maxThumbnailSizeBytes,
                        receivedBytes: metadata.sizeBytes,
                    },
                );
            }

            if (metadata.sizeBytes < 1) {
                throw pluginError.badRequest(
                    'THUMBNAIL_INVALID_SIZE',
                    'Uploaded thumbnail size must be greater than zero',
                    {
                        receivedBytes: metadata.sizeBytes,
                    },
                );
            }

            const thumbnailUrl = this.pluginStorageService.buildCdnUrl(objectKey);

            await client.query(
                `
                    UPDATE "Issue"
                    SET "thumbnailUrl" = $1,
                        "updatedAt" = NOW()
                    WHERE id = $2
                `,
                [thumbnailUrl, issue.id],
            );

            await client.query('COMMIT');
            return { thumbnailUrl };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    private safeUploadUrlTtlSeconds() {
        if (!Number.isFinite(this.uploadUrlTtlSeconds) || this.uploadUrlTtlSeconds < 60) {
            return 300;
        }

        return this.uploadUrlTtlSeconds;
    }

    private async findActiveIdempotencyRecord(
        client: PoolClient,
        patId: string,
        idempotencyHash: string,
    ) {
        const result = await client.query<IdempotencyRow>(
            `
                SELECT "requestHash",
                       "responseBody",
                       "responseStatus"
                FROM "PluginIdempotencyRecord"
                WHERE "patId" = $1
                  AND "idempotencyHash" = $2
                  AND "expiresAt" > NOW()
                ORDER BY "createdAt" DESC
                LIMIT 1
            `,
            [patId, idempotencyHash],
        );

        return result.rows[0] ?? null;
    }

    private parseResponseBody(responseBody: unknown) {
        if (typeof responseBody === 'string') {
            return JSON.parse(responseBody);
        }

        return responseBody;
    }

    private async assertWritableProjectAccess(
        client: PoolClient,
        projectId: string,
        orgId: string,
        userId: string,
    ) {
        const membership = await client.query<{ role: string }>(
            `
                SELECT pm.role
                FROM "ProjectMembership" pm
                JOIN "Project" p ON p.id = pm."projectId"
                WHERE pm."projectId" = $1
                  AND pm."userId" = $2
                  AND p."orgId" = $3
                LIMIT 1
            `,
            [projectId, userId, orgId],
        );

        const role = membership.rows[0]?.role;

        if (!role) {
            throw pluginError.forbidden(
                'PROJECT_ACCESS_DENIED',
                'No project membership found for this PAT user',
            );
        }

        if (!pluginWriteRoles.has(role)) {
            throw pluginError.forbidden(
                'PROJECT_ROLE_INSUFFICIENT',
                'Project role does not allow plugin issue creation',
                {
                    minimumRole: 'PROJECT_MEMBER',
                    receivedRole: role,
                },
            );
        }
    }

    private buildThumbnailObjectKey(
        orgId: string,
        projectId: string,
        issueId: string,
        contentType: string,
    ) {
        const extension = contentType === 'image/png' ? 'png' : 'jpg';
        return `org/${orgId}/project/${projectId}/issue/${issueId}/thumb.${extension}`;
    }

    private buildFigmaDeepLink(figmaFileKey: string, nodeId: string) {
        return `https://www.figma.com/file/${encodeURIComponent(
            figmaFileKey,
        )}?node-id=${encodeURIComponent(nodeId)}`;
    }

    private async requirePat(authorizationHeader: string | undefined, requiredScope?: string) {
        const token = this.extractBearerToken(authorizationHeader);
        const pat = await this.findPatByToken(token);

        if (!pat) {
            throw pluginError.unauthorized();
        }

        if (requiredScope && !pat.scopes.includes(requiredScope)) {
            throw pluginError.forbidden(
                'MISSING_SCOPE',
                'PAT is missing required scope',
                { requiredScope },
            );
        }

        await this.pool.query('UPDATE "PersonalAccessToken" SET "lastUsedAt" = NOW() WHERE id = $1', [
            pat.id,
        ]);

        return pat;
    }

    private extractBearerToken(authorizationHeader: string | undefined) {
        if (!authorizationHeader) {
            throw pluginError.unauthorized('Missing PAT bearer token');
        }

        const [scheme, token] = authorizationHeader.split(' ');

        if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
            throw pluginError.unauthorized('Authorization header must be a Bearer PAT token');
        }

        return token.trim();
    }

    private async findPatByToken(token: string): Promise<PatContext | null> {
        const tokenHash = this.sha256(token);
        const result = await this.pool.query<PatRow>(
            `
                SELECT id,
                       "orgId",
                       "userId",
                       scopes,
                       "expiresAt"
                FROM "PersonalAccessToken"
                WHERE "revokedAt" IS NULL
                  AND ("expiresAt" > NOW() OR ("graceUntil" IS NOT NULL AND "graceUntil" > NOW()))
                  AND "tokenHash" = $1
                LIMIT 1
            `,
            [tokenHash],
        );

        if (!result.rows[0]) {
            return null;
        }

        return this.mapPatContext(result.rows[0]);
    }

    private mapPatContext(row: PatRow): PatContext {
        return {
            id: row.id,
            orgId: row.orgId,
            userId: row.userId,
            scopes: row.scopes ?? [],
            expiresAt: new Date(row.expiresAt).toISOString(),
        };
    }

    private sha256(value: string) {
        return createHash('sha256').update(value).digest('hex');
    }

    private stableStringify(value: unknown): string {
        if (value === null || typeof value !== 'object') {
            return JSON.stringify(value);
        }

        if (Array.isArray(value)) {
            return `[${value.map((entry) => this.stableStringify(entry)).join(',')}]`;
        }

        const objectEntries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
            left.localeCompare(right),
        );

        return `{${objectEntries
            .map(([key, child]) => `${JSON.stringify(key)}:${this.stableStringify(child)}`)
            .join(',')}}`;
    }

    private generateId(prefix: string) {
        return `${prefix}_${randomBytes(12).toString('hex')}`;
    }

    private buildPoolConfig(): PoolConfig {
        if (process.env.DATABASE_URL) {
            return {
                connectionString: process.env.DATABASE_URL,
            };
        }

        return {
            host: process.env.DB_HOST || 'localhost',
            port: Number.parseInt(process.env.DB_PORT || '5432', 10),
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'postgres',
            database: process.env.DB_NAME || 'sos_db',
        };
    }
}
