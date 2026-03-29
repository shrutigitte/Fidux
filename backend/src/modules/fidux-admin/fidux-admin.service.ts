import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { Pool, PoolClient, PoolConfig } from 'pg';

import { CreateOrganizationDto } from './dto/create-organization.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreatePatDto } from './dto/create-pat.dto';
import { RotatePatDto } from './dto/rotate-pat.dto';
import { AddOrgMemberDto } from './dto/add-org-member.dto';
import { UpdateOrgMemberRoleDto } from './dto/update-org-member-role.dto';
import { AddProjectMemberDto } from './dto/add-project-member.dto';
import { UpdateProjectMemberRoleDto } from './dto/update-project-member-role.dto';
import { fiduxAdminError } from './fidux-admin.errors';
import { AuthenticatedUser } from '../auth/auth.types';

type CurrentUser = {
    id: string;
    email: string;
};

type OrgRole = 'ORG_OWNER' | 'ORG_ADMIN' | 'ORG_MEMBER';
type ProjectRole = 'PROJECT_ADMIN' | 'PROJECT_MEMBER' | 'PROJECT_VIEWER';

const orgRoleRank: Record<OrgRole, number> = {
    ORG_MEMBER: 1,
    ORG_ADMIN: 2,
    ORG_OWNER: 3,
};

const projectRoleRank: Record<ProjectRole, number> = {
    PROJECT_VIEWER: 1,
    PROJECT_MEMBER: 2,
    PROJECT_ADMIN: 3,
};

const allowedScopes = new Set(['plugin:read_projects', 'plugin:write_issues']);

@Injectable()
export class FiduxAdminService {
    private readonly pool: Pool;

    constructor() {
        this.pool = new Pool(this.buildPoolConfig());
    }

    async createOrganization(currentUserInput: AuthenticatedUser, payload: CreateOrganizationDto) {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            const user = await this.resolveCurrentUser(client, currentUserInput);
            const orgId = this.generateId('org');

            await client.query(
                `
                    INSERT INTO "Organization" (
                        id,
                        name,
                        "createdAt",
                        "updatedAt"
                    ) VALUES ($1, $2, NOW(), NOW())
                `,
                [orgId, payload.name.trim()],
            );

            await client.query(
                `
                    INSERT INTO "OrgMembership" (
                        id,
                        "orgId",
                        "userId",
                        role,
                        "createdAt"
                    ) VALUES ($1, $2, $3, 'ORG_OWNER', NOW())
                `,
                [this.generateId('om'), orgId, user.id],
            );

            await client.query('COMMIT');

            return {
                organization: {
                    id: orgId,
                    name: payload.name.trim(),
                },
                membership: {
                    role: 'ORG_OWNER',
                },
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async createProject(
        currentUserInput: AuthenticatedUser,
        orgId: string,
        payload: CreateProjectDto,
    ) {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            const user = await this.resolveCurrentUser(client, currentUserInput);
            const membership = await this.requireOrgMembership(client, orgId, user.id, 'ORG_ADMIN');

            const projectId = this.generateId('proj');

            try {
                await client.query(
                    `
                        INSERT INTO "Project" (
                            id,
                            "orgId",
                            name,
                            "createdAt",
                            "updatedAt"
                        ) VALUES ($1, $2, $3, NOW(), NOW())
                    `,
                    [projectId, orgId, payload.name.trim()],
                );
            } catch (error) {
                if (this.isUniqueViolation(error)) {
                    throw fiduxAdminError.conflict(
                        'PROJECT_NAME_EXISTS',
                        'Project name already exists in this organization',
                    );
                }

                throw error;
            }

            await client.query(
                `
                    INSERT INTO "ProjectMembership" (
                        id,
                        "projectId",
                        "userId",
                        role,
                        "createdAt"
                    ) VALUES ($1, $2, $3, 'PROJECT_ADMIN', NOW())
                    ON CONFLICT ("projectId", "userId")
                    DO UPDATE SET role = 'PROJECT_ADMIN'
                `,
                [this.generateId('pm'), projectId, user.id],
            );

            await client.query('COMMIT');

            return {
                project: {
                    id: projectId,
                    orgId,
                    name: payload.name.trim(),
                },
                actorRole: membership.role,
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async listMyOrganizations(currentUserInput: AuthenticatedUser) {
        const client = await this.pool.connect();

        try {
            const user = await this.resolveCurrentUser(client, currentUserInput);
            const result = await client.query<{
                orgId: string;
                name: string;
                role: OrgRole;
                createdAt: Date;
            }>(
                `
                    SELECT o.id AS "orgId",
                           o.name,
                           om.role,
                           o."createdAt"
                    FROM "OrgMembership" om
                    INNER JOIN "Organization" o ON o.id = om."orgId"
                    WHERE om."userId" = $1
                    ORDER BY o."createdAt" DESC
                `,
                [user.id],
            );

            return {
                organizations: result.rows.map((row) => ({
                    id: row.orgId,
                    name: row.name,
                    role: row.role,
                    createdAt: row.createdAt,
                })),
            };
        } finally {
            client.release();
        }
    }

    async listOrgMembers(currentUserInput: AuthenticatedUser, orgId: string) {
        const client = await this.pool.connect();

        try {
            const user = await this.resolveCurrentUser(client, currentUserInput);
            await this.requireOrgMembership(client, orgId, user.id, 'ORG_ADMIN');

            const result = await client.query<{
                userId: string;
                email: string;
                name: string | null;
                imageUrl: string | null;
                role: OrgRole;
                createdAt: Date;
            }>(
                `
                    SELECT u.id AS "userId",
                           u.email,
                           u.name,
                           u."imageUrl",
                           om.role,
                           om."createdAt"
                    FROM "OrgMembership" om
                    INNER JOIN "User" u ON u.id = om."userId"
                    WHERE om."orgId" = $1
                    ORDER BY om.role ASC, om."createdAt" ASC
                `,
                [orgId],
            );

            return {
                members: result.rows.map((row) => ({
                    userId: row.userId,
                    email: row.email,
                    name: row.name,
                    imageUrl: row.imageUrl,
                    role: row.role,
                    joinedAt: row.createdAt,
                })),
            };
        } finally {
            client.release();
        }
    }

    async addOrgMember(currentUserInput: AuthenticatedUser, orgId: string, payload: AddOrgMemberDto) {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            const user = await this.resolveCurrentUser(client, currentUserInput);
            await this.requireOrgMembership(client, orgId, user.id, 'ORG_ADMIN');

            const memberUser = await this.findUserByEmail(client, payload.email);
            if (!memberUser) {
                throw fiduxAdminError.notFound(
                    'USER_NOT_FOUND',
                    'User account not found. Ask the user to sign up first.',
                );
            }

            await client.query(
                `
                    INSERT INTO "OrgMembership" (
                        id,
                        "orgId",
                        "userId",
                        role,
                        "createdAt"
                    ) VALUES ($1, $2, $3, $4, NOW())
                    ON CONFLICT ("orgId", "userId")
                    DO UPDATE SET role = EXCLUDED.role
                `,
                [this.generateId('om'), orgId, memberUser.id, payload.role],
            );

            await client.query('COMMIT');

            return {
                member: {
                    userId: memberUser.id,
                    email: memberUser.email,
                    name: memberUser.name,
                    role: payload.role,
                },
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async updateOrgMemberRole(
        currentUserInput: AuthenticatedUser,
        orgId: string,
        targetUserId: string,
        payload: UpdateOrgMemberRoleDto,
    ) {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            const user = await this.resolveCurrentUser(client, currentUserInput);
            await this.requireOrgMembership(client, orgId, user.id, 'ORG_OWNER');

            if (targetUserId === user.id) {
                throw fiduxAdminError.conflict(
                    'OWNER_ROLE_LOCKED',
                    'Org owner cannot update own role in MVP',
                );
            }

            const existing = await client.query<{ role: OrgRole }>(
                `
                    SELECT role
                    FROM "OrgMembership"
                    WHERE "orgId" = $1
                      AND "userId" = $2
                    LIMIT 1
                `,
                [orgId, targetUserId],
            );

            if (!existing.rows[0]) {
                throw fiduxAdminError.notFound('MEMBER_NOT_FOUND', 'Organization member not found');
            }

            await client.query(
                `
                    UPDATE "OrgMembership"
                    SET role = $3
                    WHERE "orgId" = $1
                      AND "userId" = $2
                `,
                [orgId, targetUserId, payload.role],
            );

            await client.query('COMMIT');

            return {
                updated: true,
                userId: targetUserId,
                role: payload.role,
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async listProjectMembers(currentUserInput: AuthenticatedUser, projectId: string) {
        const client = await this.pool.connect();

        try {
            const user = await this.resolveCurrentUser(client, currentUserInput);
            const project = await this.getProjectById(client, projectId);
            if (!project) {
                throw fiduxAdminError.notFound('PROJECT_NOT_FOUND', 'Project not found');
            }

            // Project member directory is safe for all project members and
            // needed for assignee dropdowns in board flows.
            await this.requireProjectRole(client, project.id, user.id, 'PROJECT_VIEWER');

            const result = await client.query<{
                userId: string;
                email: string;
                name: string | null;
                role: ProjectRole;
                createdAt: Date;
            }>(
                `
                    SELECT u.id AS "userId",
                           u.email,
                           u.name,
                           pm.role,
                           pm."createdAt"
                    FROM "ProjectMembership" pm
                    INNER JOIN "User" u ON u.id = pm."userId"
                    WHERE pm."projectId" = $1
                    ORDER BY pm.role ASC, pm."createdAt" ASC
                `,
                [projectId],
            );

            return {
                members: result.rows.map((row) => ({
                    userId: row.userId,
                    email: row.email,
                    name: row.name,
                    role: row.role,
                    joinedAt: row.createdAt,
                })),
            };
        } finally {
            client.release();
        }
    }

    async addProjectMember(
        currentUserInput: AuthenticatedUser,
        projectId: string,
        payload: AddProjectMemberDto,
    ) {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            const user = await this.resolveCurrentUser(client, currentUserInput);
            const project = await this.getProjectById(client, projectId);
            if (!project) {
                throw fiduxAdminError.notFound('PROJECT_NOT_FOUND', 'Project not found');
            }

            await this.requireProjectManagementAccess(client, project.id, project.orgId, user.id);

            const memberUser = await this.findUserByEmail(client, payload.email);
            if (!memberUser) {
                throw fiduxAdminError.notFound(
                    'USER_NOT_FOUND',
                    'User account not found. Ask the user to sign up first.',
                );
            }

            await this.requireOrgMembership(client, project.orgId, memberUser.id, 'ORG_MEMBER');

            await client.query(
                `
                    INSERT INTO "ProjectMembership" (
                        id,
                        "projectId",
                        "userId",
                        role,
                        "createdAt"
                    ) VALUES ($1, $2, $3, $4, NOW())
                    ON CONFLICT ("projectId", "userId")
                    DO UPDATE SET role = EXCLUDED.role
                `,
                [this.generateId('pm'), projectId, memberUser.id, payload.role],
            );

            await client.query('COMMIT');

            return {
                member: {
                    userId: memberUser.id,
                    email: memberUser.email,
                    name: memberUser.name,
                    role: payload.role,
                },
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async updateProjectMemberRole(
        currentUserInput: AuthenticatedUser,
        projectId: string,
        targetUserId: string,
        payload: UpdateProjectMemberRoleDto,
    ) {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            const user = await this.resolveCurrentUser(client, currentUserInput);
            const project = await this.getProjectById(client, projectId);
            if (!project) {
                throw fiduxAdminError.notFound('PROJECT_NOT_FOUND', 'Project not found');
            }

            await this.requireProjectManagementAccess(client, project.id, project.orgId, user.id);

            const existing = await client.query<{ role: ProjectRole }>(
                `
                    SELECT role
                    FROM "ProjectMembership"
                    WHERE "projectId" = $1
                      AND "userId" = $2
                    LIMIT 1
                `,
                [projectId, targetUserId],
            );

            if (!existing.rows[0]) {
                throw fiduxAdminError.notFound('MEMBER_NOT_FOUND', 'Project member not found');
            }

            await client.query(
                `
                    UPDATE "ProjectMembership"
                    SET role = $3
                    WHERE "projectId" = $1
                      AND "userId" = $2
                `,
                [projectId, targetUserId, payload.role],
            );

            await client.query('COMMIT');

            return {
                updated: true,
                userId: targetUserId,
                role: payload.role,
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async listPats(currentUserInput: AuthenticatedUser, orgId: string) {
        const client = await this.pool.connect();

        try {
            const user = await this.resolveCurrentUser(client, currentUserInput);
            await this.requireOrgMembership(client, orgId, user.id, 'ORG_MEMBER');

            const result = await client.query<{
                id: string;
                name: string;
                scopes: string[];
                createdAt: Date;
                lastUsedAt: Date | null;
                expiresAt: Date;
                revokedAt: Date | null;
            }>(
                `
                    SELECT id,
                           name,
                           scopes,
                           "createdAt",
                           "lastUsedAt",
                           "expiresAt",
                           "revokedAt"
                    FROM "PersonalAccessToken"
                    WHERE "orgId" = $1
                      AND "userId" = $2
                    ORDER BY "createdAt" DESC
                `,
                [orgId, user.id],
            );

            return {
                tokens: result.rows.map((row) => ({
                    id: row.id,
                    name: row.name,
                    scopes: row.scopes,
                    createdAt: row.createdAt,
                    lastUsedAt: row.lastUsedAt,
                    expiresAt: row.expiresAt,
                    revokedAt: row.revokedAt,
                })),
            };
        } finally {
            client.release();
        }
    }

    async createPat(currentUserInput: AuthenticatedUser, orgId: string, payload: CreatePatDto) {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            const user = await this.resolveCurrentUser(client, currentUserInput);
            await this.requireOrgMembership(client, orgId, user.id, 'ORG_MEMBER');

            this.assertAllowedScopes(payload.scopes);

            const expiryDays = payload.expiryDays ?? 60;
            const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
            const token = this.generatePatToken();
            const tokenSalt = randomBytes(16).toString('hex');
            const tokenHash = this.sha256(token);
            const patId = this.generateId('pat');

            await client.query(
                `
                    INSERT INTO "PersonalAccessToken" (
                        id,
                        "orgId",
                        "userId",
                        name,
                        "tokenHash",
                        "tokenSalt",
                        scopes,
                        "createdAt",
                        "expiresAt"
                    ) VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6,
                        $7::text[],
                        NOW(),
                        $8
                    )
                `,
                [
                    patId,
                    orgId,
                    user.id,
                    payload.name.trim(),
                    tokenHash,
                    tokenSalt,
                    payload.scopes,
                    expiresAt,
                ],
            );

            await client.query('COMMIT');

            return {
                patId,
                token,
                meta: {
                    name: payload.name.trim(),
                    scopes: payload.scopes,
                    expiresAt,
                },
            };
        } catch (error) {
            await client.query('ROLLBACK');

            if (this.isUniqueViolation(error)) {
                throw fiduxAdminError.conflict(
                    'TOKEN_HASH_COLLISION',
                    'Token generation conflict; retry creating a PAT',
                );
            }

            throw error;
        } finally {
            client.release();
        }
    }

    async revokePat(currentUserInput: AuthenticatedUser, orgId: string, patId: string) {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            const user = await this.resolveCurrentUser(client, currentUserInput);
            const membership = await this.requireOrgMembership(client, orgId, user.id, 'ORG_MEMBER');
            const token = await this.getPat(client, orgId, patId);

            if (!token) {
                throw fiduxAdminError.notFound('PAT_NOT_FOUND', 'Personal access token not found');
            }

            const isOwner = token.userId === user.id;
            const canManageAny = orgRoleRank[membership.role] >= orgRoleRank.ORG_ADMIN;

            if (!isOwner && !canManageAny) {
                throw fiduxAdminError.forbidden(
                    'FORBIDDEN',
                    'Only PAT owner or org admin can revoke this token',
                );
            }

            await client.query(
                `
                    UPDATE "PersonalAccessToken"
                    SET "revokedAt" = NOW(),
                        "graceUntil" = NULL
                    WHERE id = $1
                `,
                [patId],
            );

            await client.query('COMMIT');

            return {
                revoked: true,
                patId,
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async rotatePat(
        currentUserInput: AuthenticatedUser,
        orgId: string,
        patId: string,
        payload: RotatePatDto,
    ) {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            const user = await this.resolveCurrentUser(client, currentUserInput);
            const membership = await this.requireOrgMembership(client, orgId, user.id, 'ORG_MEMBER');
            const existing = await this.getPat(client, orgId, patId);

            if (!existing) {
                throw fiduxAdminError.notFound('PAT_NOT_FOUND', 'Personal access token not found');
            }

            const isOwner = existing.userId === user.id;
            const canManageAny = orgRoleRank[membership.role] >= orgRoleRank.ORG_ADMIN;

            if (!isOwner && !canManageAny) {
                throw fiduxAdminError.forbidden(
                    'FORBIDDEN',
                    'Only PAT owner or org admin can rotate this token',
                );
            }

            if (existing.revokedAt) {
                throw fiduxAdminError.conflict('PAT_ALREADY_REVOKED', 'Cannot rotate a revoked PAT');
            }

            const graceHours = payload.graceHours ?? 24;
            const expiryDays = payload.expiryDays ?? 60;

            const token = this.generatePatToken();
            const tokenHash = this.sha256(token);
            const tokenSalt = randomBytes(16).toString('hex');
            const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
            const newPatId = this.generateId('pat');

            await client.query(
                `
                    INSERT INTO "PersonalAccessToken" (
                        id,
                        "orgId",
                        "userId",
                        name,
                        "tokenHash",
                        "tokenSalt",
                        scopes,
                        "createdAt",
                        "expiresAt"
                    ) VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6,
                        $7::text[],
                        NOW(),
                        $8
                    )
                `,
                [
                    newPatId,
                    existing.orgId,
                    existing.userId,
                    existing.name,
                    tokenHash,
                    tokenSalt,
                    existing.scopes,
                    expiresAt,
                ],
            );

            if (graceHours === 0) {
                await client.query(
                    `
                        UPDATE "PersonalAccessToken"
                        SET "revokedAt" = NOW(),
                            "graceUntil" = NULL
                        WHERE id = $1
                    `,
                    [existing.id],
                );
            } else {
                await client.query(
                    `
                        UPDATE "PersonalAccessToken"
                        SET "graceUntil" = NOW() + ($2::text || ' hours')::interval
                        WHERE id = $1
                    `,
                    [existing.id, String(graceHours)],
                );
            }

            await client.query('COMMIT');

            return {
                oldPatId: existing.id,
                newPatId,
                token,
                graceHours,
                expiresAt,
                scopes: existing.scopes,
            };
        } catch (error) {
            await client.query('ROLLBACK');

            if (this.isUniqueViolation(error)) {
                throw fiduxAdminError.conflict(
                    'TOKEN_HASH_COLLISION',
                    'Token generation conflict; retry rotating PAT',
                );
            }

            throw error;
        } finally {
            client.release();
        }
    }

    private async resolveCurrentUser(client: PoolClient, input: AuthenticatedUser): Promise<CurrentUser> {
        const userId = input.userId?.trim();
        const email = input.email?.trim().toLowerCase();

        if (!userId || !email) {
            throw fiduxAdminError.unauthorized('Invalid authenticated user context');
        }

        const existingUser = await client.query<CurrentUser>(
            `
                SELECT id, email
                FROM "User"
                WHERE id = $1
                  AND email = $2
                LIMIT 1
            `,
            [userId, email],
        );

        if (!existingUser.rows[0]) {
            throw fiduxAdminError.unauthorized('Authenticated user was not found');
        }

        return existingUser.rows[0];
    }

    private async requireOrgMembership(
        client: PoolClient,
        orgId: string,
        userId: string,
        minimumRole: OrgRole,
    ) {
        const membership = await client.query<{ role: OrgRole }>(
            `
                SELECT role
                FROM "OrgMembership"
                WHERE "orgId" = $1
                  AND "userId" = $2
                LIMIT 1
            `,
            [orgId, userId],
        );

        const role = membership.rows[0]?.role;

        if (!role) {
            throw fiduxAdminError.forbidden('FORBIDDEN', 'You are not a member of this organization');
        }

        if (orgRoleRank[role] < orgRoleRank[minimumRole]) {
            throw fiduxAdminError.forbidden(
                'FORBIDDEN',
                'Organization role is insufficient for this action',
                {
                    minimumRole,
                    receivedRole: role,
                },
            );
        }

        return { role };
    }

    private async requireProjectRole(
        client: PoolClient,
        projectId: string,
        userId: string,
        minimumRole: ProjectRole,
    ) {
        const membership = await client.query<{ role: ProjectRole }>(
            `
                SELECT role
                FROM "ProjectMembership"
                WHERE "projectId" = $1
                  AND "userId" = $2
                LIMIT 1
            `,
            [projectId, userId],
        );

        const role = membership.rows[0]?.role;
        if (!role) {
            throw fiduxAdminError.forbidden('FORBIDDEN', 'You are not a member of this project');
        }

        if (projectRoleRank[role] < projectRoleRank[minimumRole]) {
            throw fiduxAdminError.forbidden(
                'FORBIDDEN',
                'Project role is insufficient for this action',
                {
                    minimumRole,
                    receivedRole: role,
                },
            );
        }

        return { role };
    }

    private async requireProjectManagementAccess(
        client: PoolClient,
        projectId: string,
        orgId: string,
        userId: string,
    ) {
        try {
            await this.requireOrgMembership(client, orgId, userId, 'ORG_ADMIN');
            return;
        } catch (error) {
            if (
                !(error instanceof Error) ||
                !('getStatus' in error) ||
                typeof (error as { getStatus?: () => number }).getStatus !== 'function' ||
                (error as { getStatus: () => number }).getStatus() !== 403
            ) {
                throw error;
            }
        }

        await this.requireProjectRole(client, projectId, userId, 'PROJECT_ADMIN');
    }

    private async findUserByEmail(client: PoolClient, email: string) {
        const normalized = email.trim().toLowerCase();

        const result = await client.query<{
            id: string;
            email: string;
            name: string | null;
        }>(
            `
                SELECT id, email, name
                FROM "User"
                WHERE email = $1
                LIMIT 1
            `,
            [normalized],
        );

        return result.rows[0] ?? null;
    }

    private async getProjectById(client: PoolClient, projectId: string) {
        const result = await client.query<{
            id: string;
            orgId: string;
            name: string;
        }>(
            `
                SELECT id, "orgId", name
                FROM "Project"
                WHERE id = $1
                LIMIT 1
            `,
            [projectId],
        );

        return result.rows[0] ?? null;
    }

    private async getPat(client: PoolClient, orgId: string, patId: string) {
        const result = await client.query<{
            id: string;
            orgId: string;
            userId: string;
            name: string;
            scopes: string[];
            revokedAt: Date | null;
        }>(
            `
                SELECT id,
                       "orgId",
                       "userId",
                       name,
                       scopes,
                       "revokedAt"
                FROM "PersonalAccessToken"
                WHERE id = $1
                  AND "orgId" = $2
                LIMIT 1
            `,
            [patId, orgId],
        );

        return result.rows[0] ?? null;
    }

    private assertAllowedScopes(scopes: string[]) {
        if (!Array.isArray(scopes) || scopes.length === 0) {
            throw fiduxAdminError.badRequest(
                'VALIDATION_ERROR',
                'PAT scopes must include at least one scope',
            );
        }

        for (const scope of scopes) {
            if (!allowedScopes.has(scope)) {
                throw fiduxAdminError.badRequest(
                    'VALIDATION_ERROR',
                    'Invalid PAT scope',
                    {
                        scope,
                    },
                );
            }
        }
    }

    private isUniqueViolation(error: unknown) {
        return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === '23505');
    }

    private generatePatToken() {
        return `fidux_pat_${randomBytes(18).toString('hex')}`;
    }

    private generateId(prefix: string) {
        return `${prefix}_${randomBytes(12).toString('hex')}`;
    }

    private sha256(value: string) {
        return createHash('sha256').update(value).digest('hex');
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
