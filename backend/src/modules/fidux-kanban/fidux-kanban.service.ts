import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { Pool, PoolClient, PoolConfig } from 'pg';

import { renderFiduxEmailHtml, renderFiduxEmailText } from '../../common/email/fidux-email-template';
import { sendFiduxEmail } from '../../common/email/fidux-mailer';
import { AuthenticatedUser } from '../auth/auth.types';
import { CreateBoardIssueDto } from './dto/create-board-issue.dto';
import { ListProjectNotificationsDto } from './dto/list-project-notifications.dto';
import { ListProjectIssuesDto } from './dto/list-project-issues.dto';
import { ListMyProjectsDto } from './dto/list-my-projects.dto';
import { MoveIssueDto } from './dto/move-issue.dto';
import { SendIssueMessageDto } from './dto/send-issue-message.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { fiduxKanbanError } from './fidux-kanban.errors';

type CurrentUser = {
    id: string;
    email: string;
    name: string | null;
};

type ProjectRole = 'PROJECT_VIEWER' | 'PROJECT_MEMBER' | 'PROJECT_ADMIN';
type OrgRole = 'ORG_OWNER' | 'ORG_ADMIN' | 'ORG_MEMBER';

const projectRoleRank: Record<ProjectRole, number> = {
    PROJECT_VIEWER: 1,
    PROJECT_MEMBER: 2,
    PROJECT_ADMIN: 3,
};

type IssueRow = {
    id: string;
    projectId: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    assigneeId: string | null;
    archivedAt: Date | null;
    archivedById: string | null;
    archivedReason: string | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    figmaFileKey: string | null;
    figmaNodeId: string | null;
    figmaNodeName: string | null;
    figmaDeepLink: string | null;
    thumbnailUrl: string | null;
    assigneeName: string | null;
    assigneeEmail: string | null;
    assignedAt: Date | null;
    archivedByName: string | null;
    archivedByEmail: string | null;
};

type BoardIssueRow = {
    id: string;
    title: string;
    status: string;
    priority: string;
    assigneeId: string | null;
    version: number;
    updatedAt: Date;
    thumbnailUrl: string | null;
    assigneeName: string | null;
    assigneeEmail: string | null;
    assignedAt: Date | null;
};

type MembershipProjectRow = {
    id: string;
    orgId: string;
    name: string;
    role: ProjectRole;
    createdAt: Date;
};

type IssueMessageRow = {
    id: string;
    projectId: string;
    issueId: string;
    senderId: string;
    senderName: string | null;
    senderEmail: string;
    content: string;
    createdAt: Date;
};

type ProjectParticipantRow = {
    userId: string;
    email: string;
    name: string | null;
    role: ProjectRole;
    createdAt: Date;
};

type AssignmentNotificationRow = {
    id: string;
    issueId: string;
    issueTitle: string;
    action: 'ISSUE_ASSIGNEE_CHANGED' | 'ISSUE_CREATED';
    payload: Record<string, unknown> | null;
    createdAt: Date;
    actorId: string;
    actorName: string | null;
    actorEmail: string;
};

type IssueActivityAction =
    | 'ISSUE_CREATED'
    | 'ISSUE_STATUS_CHANGED'
    | 'ISSUE_ASSIGNEE_CHANGED'
    | 'ISSUE_PRIORITY_CHANGED'
    | 'ISSUE_TITLE_CHANGED';

type IssueActivityRow = {
    id: string;
    action: IssueActivityAction;
    payload: Record<string, unknown> | null;
    createdAt: Date;
    actorId: string;
    actorName: string | null;
    actorEmail: string;
};

type UserLookupRow = {
    id: string;
    name: string | null;
    email: string;
};

@Injectable()
export class FiduxKanbanService {
    private readonly pool: Pool;
    private readonly webAppBaseUrl: string;
    private readonly resendApiKey: string;
    private readonly emailFrom: string;
    private readonly smtpHost: string;
    private readonly smtpPort: number;
    private readonly smtpSecure: boolean;
    private readonly smtpUser: string;
    private readonly smtpPass: string;

    constructor(private readonly configService: ConfigService) {
        this.pool = new Pool(this.buildPoolConfig());
        this.webAppBaseUrl =
            this.configService.get<string>('FIDUX_WEB_APP_URL')?.trim() ||
            this.configService.get<string>('NEXTAUTH_URL')?.trim() ||
            'http://localhost:5173';
        this.resendApiKey = this.configService.get<string>('RESEND_API_KEY')?.trim() || '';
        this.emailFrom = this.configService.get<string>('EMAIL_FROM')?.trim() || '';
        this.smtpHost = this.configService.get<string>('SMTP_HOST')?.trim() || '';
        this.smtpPort = this.resolveSmtpPort(this.configService.get<string>('SMTP_PORT'));
        this.smtpSecure = (this.configService.get<string>('SMTP_SECURE')?.trim() || 'true') === 'true';
        this.smtpUser = this.configService.get<string>('SMTP_USER')?.trim() || '';
        this.smtpPass = this.configService.get<string>('SMTP_PASS')?.trim() || '';
    }

    async listMyProjects(currentUserInput: AuthenticatedUser, query: ListMyProjectsDto) {
        const client = await this.pool.connect();

        try {
            const user = await this.resolveCurrentUser(client, currentUserInput);

            const params: unknown[] = [user.id];
            let whereSql = `WHERE pm."userId" = $1`;

            if (query.orgId && query.orgId.trim()) {
                params.push(query.orgId.trim());
                whereSql += ` AND p."orgId" = $${params.length}`;
            }

            const result = await client.query<MembershipProjectRow>(
                `
                    SELECT p.id,
                           p."orgId",
                           p.name,
                           pm.role,
                           p."createdAt"
                    FROM "ProjectMembership" pm
                    INNER JOIN "Project" p ON p.id = pm."projectId"
                    ${whereSql}
                    ORDER BY p."createdAt" DESC
                `,
                params,
            );

            return {
                projects: result.rows.map((project) => ({
                    id: project.id,
                    orgId: project.orgId,
                    name: project.name,
                    role: project.role,
                    createdAt: project.createdAt,
                })),
            };
        } finally {
            client.release();
        }
    }

    async listProjectIssues(
        currentUserInput: AuthenticatedUser,
        projectId: string,
        query: ListProjectIssuesDto,
    ) {
        const client = await this.pool.connect();

        try {
            const user = await this.resolveCurrentUser(client, currentUserInput);
            await this.requireProjectRole(client, projectId, user.id, 'PROJECT_VIEWER');
            await this.autoArchiveStaleDoneIssues(client, projectId);

            const params: unknown[] = [projectId];
            let whereSql = 'WHERE i."projectId" = $1 AND i."archivedAt" IS NULL';

            if (query.status) {
                params.push(query.status);
                whereSql += ` AND i.status = $${params.length}`;
            }

            if (query.assignee) {
                const assigneeId = query.assignee.trim() === 'me' ? user.id : query.assignee.trim();
                params.push(assigneeId);
                whereSql += ` AND i."assigneeId" = $${params.length}`;
            }

            const result = await client.query<BoardIssueRow>(
                `
                    SELECT i.id,
                           i.title,
                           i.status,
                           i.priority,
                           i."assigneeId",
                           i.version,
                           i."updatedAt",
                           i."thumbnailUrl",
                           assignee.name AS "assigneeName",
                           assignee.email AS "assigneeEmail",
                           COALESCE(
                               lastAssignment."createdAt",
                               CASE
                                   WHEN i."assigneeId" IS NOT NULL THEN i."createdAt"
                                   ELSE NULL
                               END
                           ) AS "assignedAt"
                    FROM "Issue" i
                    LEFT JOIN "User" assignee ON assignee.id = i."assigneeId"
                    LEFT JOIN LATERAL (
                        SELECT al."createdAt"
                        FROM "ActivityLog" al
                        WHERE al."entityType" = 'ISSUE'
                          AND al.action = 'ISSUE_ASSIGNEE_CHANGED'
                          AND al."entityId" = i.id
                          AND (al.payload->>'to') = i."assigneeId"
                        ORDER BY al."createdAt" DESC
                        LIMIT 1
                    ) lastAssignment ON TRUE
                    ${whereSql}
                    ORDER BY i."updatedAt" DESC
                `,
                params,
            );

            return {
                issues: result.rows.map((issue) => ({
                    id: issue.id,
                    title: issue.title,
                    status: issue.status,
                    priority: issue.priority,
                    assigneeId: issue.assigneeId,
                    assignee:
                        issue.assigneeId && issue.assigneeEmail
                            ? {
                                  id: issue.assigneeId,
                                  name: issue.assigneeName,
                                  email: issue.assigneeEmail,
                              }
                            : null,
                    assignedAt: issue.assignedAt,
                    version: issue.version,
                    updatedAt: issue.updatedAt,
                    thumbnailUrl: issue.thumbnailUrl,
                })),
            };
        } finally {
            client.release();
        }
    }

    async listProjectParticipants(currentUserInput: AuthenticatedUser, projectId: string) {
        const client = await this.pool.connect();

        try {
            const user = await this.resolveCurrentUser(client, currentUserInput);
            await this.requireProjectRole(client, projectId, user.id, 'PROJECT_VIEWER');

            const result = await client.query<ProjectParticipantRow>(
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

    async listProjectNotifications(
        currentUserInput: AuthenticatedUser,
        projectId: string,
        query: ListProjectNotificationsDto,
    ) {
        const client = await this.pool.connect();

        try {
            const user = await this.resolveCurrentUser(client, currentUserInput);
            await this.requireProjectRole(client, projectId, user.id, 'PROJECT_VIEWER');

            const limit = query.limit ?? 50;
            const result = await client.query<AssignmentNotificationRow>(
                `
                    SELECT al.id,
                           al."entityId" AS "issueId",
                           i.title AS "issueTitle",
                           al.action,
                           al.payload,
                           al."createdAt",
                           actor.id AS "actorId",
                           actor.name AS "actorName",
                           actor.email AS "actorEmail"
                    FROM "ActivityLog" al
                    INNER JOIN "Issue" i ON i.id = al."entityId"
                    INNER JOIN "User" actor ON actor.id = al."actorId"
                    WHERE al."projectId" = $1
                      AND i."archivedAt" IS NULL
                      AND al."entityType" = 'ISSUE'
                      AND (
                          (al.action = 'ISSUE_ASSIGNEE_CHANGED' AND (al.payload->>'to') = $2)
                          OR (al.action = 'ISSUE_CREATED' AND (al.payload->>'assigneeId') = $2)
                      )
                    ORDER BY al."createdAt" DESC
                    LIMIT $3
                `,
                [projectId, user.id, limit],
            );

            return {
                notifications: result.rows.map((row) => {
                    const actorDisplay = row.actorName || row.actorEmail;
                    const message =
                        row.action === 'ISSUE_CREATED'
                            ? `${actorDisplay} created and assigned issue "${row.issueTitle}" to you.`
                            : `${actorDisplay} assigned issue "${row.issueTitle}" to you.`;

                    return {
                        id: row.id,
                        type: 'ASSIGNED_TO_YOU',
                        message,
                        issue: {
                            id: row.issueId,
                            title: row.issueTitle,
                        },
                        actor: {
                            id: row.actorId,
                            name: row.actorName,
                            email: row.actorEmail,
                        },
                        createdAt: row.createdAt,
                        payload: row.payload ?? {},
                    };
                }),
            };
        } finally {
            client.release();
        }
    }

    async createIssue(
        currentUserInput: AuthenticatedUser,
        projectId: string,
        payload: CreateBoardIssueDto,
    ) {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');
            const user = await this.resolveCurrentUser(client, currentUserInput);
            await this.requireProjectRole(client, projectId, user.id, 'PROJECT_MEMBER');

            const title = payload.title.trim();
            if (title.length < 3) {
                throw fiduxKanbanError.badRequest(
                    'VALIDATION_ERROR',
                    'Title must be at least 3 characters',
                );
            }

            const description = this.normalizeDescription(payload.description);
            const assigneeId = this.normalizeAssignee(payload.assigneeId);
            if (assigneeId) {
                await this.assertAssigneeBelongsToProject(client, projectId, assigneeId);
            }

            const issueId = this.generateId('iss');
            const status = payload.status ?? 'TODO';
            const priority = payload.priority ?? 'MEDIUM';

            await client.query(
                `
                    INSERT INTO "Issue" (
                        id,
                        "projectId",
                        title,
                        description,
                        status,
                        priority,
                        "assigneeId",
                        version,
                        "createdAt",
                        "updatedAt"
                    ) VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6,
                        $7,
                        1,
                        NOW(),
                        NOW()
                    )
                `,
                [issueId, projectId, title, description, status, priority, assigneeId],
            );

            const issue = await this.getIssueById(client, issueId);
            if (!issue) {
                throw fiduxKanbanError.internal(
                    'INTERNAL_ERROR',
                    'Issue creation failed unexpectedly',
                );
            }

            await this.insertActivityLog(
                client,
                issue.projectId,
                user.id,
                issue.id,
                'ISSUE_CREATED',
                {
                    source: 'web',
                    status: issue.status,
                    priority: issue.priority,
                    title: issue.title,
                    assigneeId: issue.assigneeId,
                },
            );

            const shouldSendAssignmentEmail = Boolean(issue.assigneeId && issue.assigneeEmail);
            const projectNameForEmail = shouldSendAssignmentEmail
                ? await this.getProjectName(client, issue.projectId)
                : '';

            await client.query('COMMIT');

            if (shouldSendAssignmentEmail) {
                await this.sendIssueAssignedEmail({
                    issueId: issue.id,
                    issueTitle: issue.title,
                    projectId: issue.projectId,
                    projectName: projectNameForEmail,
                    assigneeName: issue.assigneeName,
                    assigneeEmail: issue.assigneeEmail!,
                    assignedByName: user.name,
                    assignedByEmail: user.email,
                    assignmentType: 'created',
                });
            }

            return {
                issue: this.toIssueResponse(issue),
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async getIssue(currentUserInput: AuthenticatedUser, issueId: string) {
        const client = await this.pool.connect();

        try {
            const user = await this.resolveCurrentUser(client, currentUserInput);
            const issue = await this.getIssueById(client, issueId);

            if (!issue) {
                throw fiduxKanbanError.notFound('NOT_FOUND', 'Issue not found');
            }

            await this.requireProjectRole(client, issue.projectId, user.id, 'PROJECT_VIEWER');

            return {
                issue: this.toIssueResponse(issue),
            };
        } finally {
            client.release();
        }
    }

    async updateIssue(
        currentUserInput: AuthenticatedUser,
        issueId: string,
        payload: UpdateIssueDto,
    ) {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            const user = await this.resolveCurrentUser(client, currentUserInput);
            const issue = await this.getIssueById(client, issueId, true);

            if (!issue) {
                throw fiduxKanbanError.notFound('NOT_FOUND', 'Issue not found');
            }

            this.assertIssueNotArchived(issue);
            await this.requireProjectRole(client, issue.projectId, user.id, 'PROJECT_MEMBER');

            const hasAnyUpdate =
                payload.title !== undefined ||
                payload.description !== undefined ||
                payload.priority !== undefined ||
                payload.status !== undefined ||
                payload.assigneeId !== undefined;

            if (!hasAnyUpdate) {
                throw fiduxKanbanError.badRequest(
                    'VALIDATION_ERROR',
                    'At least one updatable field is required',
                );
            }

            if (payload.expectedVersion !== undefined && payload.expectedVersion !== issue.version) {
                throw fiduxKanbanError.versionConflict('Issue was updated', {
                    id: issue.id,
                    status: issue.status,
                    version: issue.version,
                });
            }

            const nextTitle = payload.title !== undefined ? payload.title.trim() : issue.title;
            const nextDescription =
                payload.description !== undefined
                    ? this.normalizeDescription(payload.description)
                    : issue.description;
            const nextPriority = payload.priority ?? issue.priority;
            const nextStatus = payload.status ?? issue.status;
            const nextAssigneeId =
                payload.assigneeId !== undefined
                    ? this.normalizeAssignee(payload.assigneeId)
                    : issue.assigneeId;

            if (nextTitle.length < 3) {
                throw fiduxKanbanError.badRequest(
                    'VALIDATION_ERROR',
                    'Title must be at least 3 characters',
                );
            }

            if (nextAssigneeId) {
                await this.assertAssigneeBelongsToProject(client, issue.projectId, nextAssigneeId);
            }

            const nothingChanged =
                nextTitle === issue.title &&
                nextDescription === issue.description &&
                nextPriority === issue.priority &&
                nextStatus === issue.status &&
                nextAssigneeId === issue.assigneeId;

            if (nothingChanged) {
                await client.query('COMMIT');
                return {
                    issue: this.toIssueResponse(issue),
                };
            }

            await client.query(
                `
                    UPDATE "Issue"
                    SET title = $2,
                        description = $3,
                        priority = $4,
                        status = $5,
                        "assigneeId" = $6,
                        version = version + 1,
                        "updatedAt" = NOW()
                    WHERE id = $1
                `,
                [issue.id, nextTitle, nextDescription, nextPriority, nextStatus, nextAssigneeId],
            );

            const updated = await this.getIssueById(client, issue.id);
            if (!updated) {
                throw fiduxKanbanError.internal(
                    'INTERNAL_ERROR',
                    'Issue update failed unexpectedly',
                );
            }

            if (nextTitle !== issue.title) {
                await this.insertActivityLog(
                    client,
                    issue.projectId,
                    user.id,
                    issue.id,
                    'ISSUE_TITLE_CHANGED',
                    {
                        field: 'title',
                        from: issue.title,
                        to: nextTitle,
                    },
                );
            }

            if (nextPriority !== issue.priority) {
                await this.insertActivityLog(
                    client,
                    issue.projectId,
                    user.id,
                    issue.id,
                    'ISSUE_PRIORITY_CHANGED',
                    {
                        field: 'priority',
                        from: issue.priority,
                        to: nextPriority,
                    },
                );
            }

            if (nextAssigneeId !== issue.assigneeId) {
                await this.insertActivityLog(
                    client,
                    issue.projectId,
                    user.id,
                    issue.id,
                    'ISSUE_ASSIGNEE_CHANGED',
                    {
                        field: 'assigneeId',
                        from: issue.assigneeId,
                        to: nextAssigneeId,
                    },
                );
            }

            if (nextStatus !== issue.status) {
                await this.insertActivityLog(
                    client,
                    issue.projectId,
                    user.id,
                    issue.id,
                    'ISSUE_STATUS_CHANGED',
                    {
                        field: 'status',
                        from: issue.status,
                        to: nextStatus,
                    },
                );
            }

            const shouldSendAssignmentEmail =
                nextAssigneeId !== issue.assigneeId && Boolean(updated.assigneeId && updated.assigneeEmail);
            const projectNameForEmail = shouldSendAssignmentEmail
                ? await this.getProjectName(client, issue.projectId)
                : '';

            await client.query('COMMIT');

            if (shouldSendAssignmentEmail) {
                await this.sendIssueAssignedEmail({
                    issueId: updated.id,
                    issueTitle: updated.title,
                    projectId: updated.projectId,
                    projectName: projectNameForEmail,
                    assigneeName: updated.assigneeName,
                    assigneeEmail: updated.assigneeEmail!,
                    assignedByName: user.name,
                    assignedByEmail: user.email,
                    assignmentType: 'reassigned',
                });
            }

            return {
                issue: this.toIssueResponse(updated),
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async moveIssue(currentUserInput: AuthenticatedUser, issueId: string, payload: MoveIssueDto) {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            const user = await this.resolveCurrentUser(client, currentUserInput);
            const issue = await this.getIssueById(client, issueId, true);

            if (!issue) {
                throw fiduxKanbanError.notFound('NOT_FOUND', 'Issue not found');
            }

            this.assertIssueNotArchived(issue);
            await this.requireProjectRole(client, issue.projectId, user.id, 'PROJECT_MEMBER');

            if (issue.version !== payload.expectedVersion) {
                throw fiduxKanbanError.versionConflict('Issue was updated', {
                    id: issue.id,
                    status: issue.status,
                    version: issue.version,
                });
            }

            if (issue.status === payload.toStatus) {
                await client.query('COMMIT');
                return {
                    issue: {
                        id: issue.id,
                        status: issue.status,
                        version: issue.version,
                        updatedAt: issue.updatedAt,
                    },
                };
            }

            const updated = await client.query<{
                id: string;
                projectId: string;
                status: string;
                version: number;
                updatedAt: Date;
            }>(
                `
                    UPDATE "Issue"
                    SET status = $2,
                        version = version + 1,
                        "updatedAt" = NOW()
                    WHERE id = $1
                    RETURNING id,
                              "projectId",
                              status,
                              version,
                              "updatedAt"
                `,
                [issue.id, payload.toStatus],
            );

            const next = updated.rows[0];

            await this.insertActivityLog(
                client,
                next.projectId,
                user.id,
                next.id,
                'ISSUE_STATUS_CHANGED',
                {
                    field: 'status',
                    from: issue.status,
                    to: next.status,
                },
            );

            await client.query('COMMIT');

            return {
                issue: {
                    id: next.id,
                    status: next.status,
                    version: next.version,
                    updatedAt: next.updatedAt,
                },
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async archiveIssue(currentUserInput: AuthenticatedUser, issueId: string) {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            const user = await this.resolveCurrentUser(client, currentUserInput);
            const issue = await this.getIssueById(client, issueId, true);

            if (!issue) {
                throw fiduxKanbanError.notFound('NOT_FOUND', 'Issue not found');
            }

            await this.requireIssueLifecycleOwnerRole(client, issue.projectId, user.id);

            if (issue.archivedAt) {
                await client.query('COMMIT');
                return {
                    archived: true,
                    issue: this.toIssueResponse(issue),
                };
            }

            await client.query(
                `
                    UPDATE "Issue"
                    SET "archivedAt" = NOW(),
                        "archivedById" = $2,
                        "archivedReason" = 'MANUAL',
                        version = version + 1,
                        "updatedAt" = NOW()
                    WHERE id = $1
                `,
                [issue.id, user.id],
            );

            const archivedIssue = await this.getIssueById(client, issue.id);
            if (!archivedIssue) {
                throw fiduxKanbanError.internal(
                    'INTERNAL_ERROR',
                    'Issue archive failed unexpectedly',
                );
            }

            await this.insertActivityLog(
                client,
                issue.projectId,
                user.id,
                issue.id,
                'ISSUE_STATUS_CHANGED',
                {
                    field: 'lifecycle',
                    from: 'ACTIVE',
                    to: 'ARCHIVED',
                    reason: 'MANUAL',
                    previousStatus: issue.status,
                },
            );

            await client.query('COMMIT');

            return {
                archived: true,
                issue: this.toIssueResponse(archivedIssue),
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async deleteIssue(currentUserInput: AuthenticatedUser, issueId: string) {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            const user = await this.resolveCurrentUser(client, currentUserInput);
            const issue = await this.getIssueById(client, issueId, true);

            if (!issue) {
                throw fiduxKanbanError.notFound('NOT_FOUND', 'Issue not found');
            }

            await this.requireIssueLifecycleOwnerRole(client, issue.projectId, user.id);

            await client.query(
                `
                    DELETE FROM "Issue"
                    WHERE id = $1
                `,
                [issue.id],
            );

            await client.query('COMMIT');

            return {
                deleted: true,
                issueId: issue.id,
                projectId: issue.projectId,
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async listIssueMessages(currentUserInput: AuthenticatedUser, issueId: string) {
        const client = await this.pool.connect();

        try {
            const user = await this.resolveCurrentUser(client, currentUserInput);
            const issue = await this.getIssueById(client, issueId);

            if (!issue) {
                throw fiduxKanbanError.notFound('NOT_FOUND', 'Issue not found');
            }

            await this.requireProjectRole(client, issue.projectId, user.id, 'PROJECT_VIEWER');

            const result = await client.query<IssueMessageRow>(
                `
                    SELECT m.id,
                           m."projectId",
                           m."issueId",
                           m."senderId",
                           u.name AS "senderName",
                           u.email AS "senderEmail",
                           m.content,
                           m."createdAt"
                    FROM (
                        SELECT id,
                               "projectId",
                               "issueId",
                               "senderId",
                               content,
                               "createdAt"
                        FROM "Message"
                        WHERE "issueId" = $1
                        ORDER BY "createdAt" DESC
                        LIMIT 200
                    ) m
                    INNER JOIN "User" u ON u.id = m."senderId"
                    ORDER BY m."createdAt" ASC
                `,
                [issueId],
            );

            return {
                messages: result.rows.map((message) => this.toIssueMessageResponse(message)),
            };
        } finally {
            client.release();
        }
    }

    async listIssueActivity(currentUserInput: AuthenticatedUser, issueId: string) {
        const client = await this.pool.connect();

        try {
            const user = await this.resolveCurrentUser(client, currentUserInput);
            const issue = await this.getIssueById(client, issueId);

            if (!issue) {
                throw fiduxKanbanError.notFound('NOT_FOUND', 'Issue not found');
            }

            await this.requireProjectRole(client, issue.projectId, user.id, 'PROJECT_VIEWER');

            const activityResult = await client.query<IssueActivityRow>(
                `
                    SELECT al.id,
                           al.action,
                           al.payload,
                           al."createdAt",
                           actor.id AS "actorId",
                           actor.name AS "actorName",
                           actor.email AS "actorEmail"
                    FROM "ActivityLog" al
                    INNER JOIN "User" actor ON actor.id = al."actorId"
                    WHERE al."entityType" = 'ISSUE'
                      AND al."entityId" = $1
                    ORDER BY al."createdAt" ASC
                    LIMIT 500
                `,
                [issueId],
            );

            const assigneeIds = new Set<string>();
            for (const row of activityResult.rows) {
                const fromId = this.extractPayloadString(row.payload, 'from');
                const toId = this.extractPayloadString(row.payload, 'to');
                const createdAssignee = this.extractPayloadString(row.payload, 'assigneeId');

                if (fromId) {
                    assigneeIds.add(fromId);
                }
                if (toId) {
                    assigneeIds.add(toId);
                }
                if (createdAssignee) {
                    assigneeIds.add(createdAssignee);
                }
            }

            const assigneeMap = new Map<string, UserLookupRow>();
            if (assigneeIds.size > 0) {
                const assigneeRows = await client.query<UserLookupRow>(
                    `
                        SELECT id, name, email
                        FROM "User"
                        WHERE id = ANY($1::text[])
                    `,
                    [[...assigneeIds]],
                );

                for (const row of assigneeRows.rows) {
                    assigneeMap.set(row.id, row);
                }
            }

            return {
                activity: activityResult.rows.map((row) =>
                    this.toIssueActivityResponseRow(row, assigneeMap),
                ),
            };
        } finally {
            client.release();
        }
    }

    async sendIssueMessage(
        currentUserInput: AuthenticatedUser,
        issueId: string,
        payload: SendIssueMessageDto,
    ) {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            const user = await this.resolveCurrentUser(client, currentUserInput);
            const issue = await this.getIssueById(client, issueId);

            if (!issue) {
                throw fiduxKanbanError.notFound('NOT_FOUND', 'Issue not found');
            }

            this.assertIssueNotArchived(issue);
            await this.requireProjectRole(client, issue.projectId, user.id, 'PROJECT_MEMBER');

            const content = payload.content.trim();
            if (content.length === 0) {
                throw fiduxKanbanError.badRequest('VALIDATION_ERROR', 'Message cannot be empty');
            }

            const inserted = await client.query<IssueMessageRow>(
                `
                    WITH inserted AS (
                        INSERT INTO "Message" (
                            id,
                            "projectId",
                            "issueId",
                            "senderId",
                            content,
                            "createdAt"
                        ) VALUES (
                            $1,
                            $2,
                            $3,
                            $4,
                            $5,
                            NOW()
                        )
                        RETURNING id,
                                  "projectId",
                                  "issueId",
                                  "senderId",
                                  content,
                                  "createdAt"
                    )
                    SELECT inserted.id,
                           inserted."projectId",
                           inserted."issueId",
                           inserted."senderId",
                           u.name AS "senderName",
                           u.email AS "senderEmail",
                           inserted.content,
                           inserted."createdAt"
                    FROM inserted
                    INNER JOIN "User" u ON u.id = inserted."senderId"
                    LIMIT 1
                `,
                [this.generateId('msg'), issue.projectId, issue.id, user.id, content],
            );

            await client.query('COMMIT');

            return {
                message: this.toIssueMessageResponse(inserted.rows[0]),
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    private async sendIssueAssignedEmail(params: {
        issueId: string;
        issueTitle: string;
        projectId: string;
        projectName: string;
        assigneeName: string | null;
        assigneeEmail: string;
        assignedByName: string | null;
        assignedByEmail: string;
        assignmentType: 'created' | 'reassigned';
    }) {
        const assigneeLabel = params.assigneeName?.trim() || params.assigneeEmail;
        const assignedByLabel = params.assignedByName?.trim() || params.assignedByEmail;
        const issueUrl = this.buildIssueUrl(params.projectId, params.issueId);
        const issueNumber = this.formatIssueNumber(params.issueId);
        const intro =
            params.assignmentType === 'created'
                ? `${assignedByLabel} created a new issue and assigned it to you in ${params.projectName}.`
                : `${assignedByLabel} assigned an issue to you in ${params.projectName}.`;

        const template = {
            preheader: `${issueNumber} assigned to you in Fidux`,
            badge: 'Issue Assigned',
            title: `Assigned: ${params.issueTitle}`,
            intro,
            facts: [
                { label: 'Issue Number', value: issueNumber },
                { label: 'Issue ID', value: params.issueId },
                { label: 'Issue Title', value: params.issueTitle },
                { label: 'Assigned To', value: assigneeLabel },
                { label: 'Assigned By', value: assignedByLabel },
                { label: 'Project', value: params.projectName },
            ],
            ctaLabel: 'Open Issue in Fidux',
            ctaUrl: issueUrl,
            helperText: 'Use the button to open the issue directly in Fidux.',
            footerNote:
                'This is an automated assignment notification from Fidux. Update your issue preferences in app settings.',
        };

        const delivery = await sendFiduxEmail(
            {
                emailFrom: this.emailFrom,
                resendApiKey: this.resendApiKey,
                smtpHost: this.smtpHost,
                smtpPort: this.smtpPort,
                smtpSecure: this.smtpSecure,
                smtpUser: this.smtpUser,
                smtpPass: this.smtpPass,
            },
            {
                to: params.assigneeEmail,
                subject: `${issueNumber} assigned to you in Fidux`,
                text: renderFiduxEmailText(template),
                html: renderFiduxEmailHtml(template),
                logTag: 'KANBAN_ASSIGNMENT_EMAIL',
            },
        );

        if (delivery.delivery === 'provider_not_configured') {
            // eslint-disable-next-line no-console
            console.log(
                `[KANBAN][DEV] Assignment email skipped (provider not configured). Issue ${params.issueId} -> ${params.assigneeEmail}. Link: ${issueUrl}`,
            );
            return;
        }

        if (!delivery.sent) {
            // eslint-disable-next-line no-console
            console.error(
                `[KANBAN][EMAIL] Assignment email failed for ${params.assigneeEmail} on issue ${params.issueId}: ${
                    delivery.error || delivery.delivery
                }`,
            );
        }
    }

    private buildIssueUrl(projectId: string, issueId: string) {
        const base = this.webAppBaseUrl.replace(/\/$/, '');
        const query = new URLSearchParams({
            projectId,
            issueId,
            view: 'full',
        }).toString();
        return `${base}/?${query}`;
    }

    private formatIssueNumber(issueId: string) {
        const compact = issueId.replace(/^iss_/i, '');
        return `FDX-${compact.slice(-8).toUpperCase()}`;
    }

    private async getProjectName(client: PoolClient, projectId: string) {
        const result = await client.query<{ name: string }>(
            `
                SELECT name
                FROM "Project"
                WHERE id = $1
                LIMIT 1
            `,
            [projectId],
        );

        return result.rows[0]?.name || projectId;
    }

    private async getIssueById(client: PoolClient, issueId: string, lockForUpdate = false) {
        const result = await client.query<IssueRow>(
            `
                SELECT i.id,
                       i."projectId",
                       i.title,
                       i.description,
                       i.status,
                       i.priority,
                       i."assigneeId",
                       i."archivedAt",
                       i."archivedById",
                       i."archivedReason",
                       i.version,
                       i."createdAt",
                       i."updatedAt",
                       i."figmaFileKey",
                       i."figmaNodeId",
                       i."figmaNodeName",
                       i."figmaDeepLink",
                       i."thumbnailUrl",
                       assignee.name AS "assigneeName",
                       assignee.email AS "assigneeEmail",
                       archivedBy.name AS "archivedByName",
                       archivedBy.email AS "archivedByEmail",
                       COALESCE(
                           lastAssignment."createdAt",
                           CASE
                               WHEN i."assigneeId" IS NOT NULL THEN i."createdAt"
                               ELSE NULL
                           END
                       ) AS "assignedAt"
                FROM "Issue" i
                LEFT JOIN "User" assignee ON assignee.id = i."assigneeId"
                LEFT JOIN "User" archivedBy ON archivedBy.id = i."archivedById"
                LEFT JOIN LATERAL (
                    SELECT al."createdAt"
                    FROM "ActivityLog" al
                    WHERE al."entityType" = 'ISSUE'
                      AND al.action = 'ISSUE_ASSIGNEE_CHANGED'
                      AND al."entityId" = i.id
                      AND (al.payload->>'to') = i."assigneeId"
                    ORDER BY al."createdAt" DESC
                    LIMIT 1
                ) lastAssignment ON TRUE
                WHERE i.id = $1
                ${lockForUpdate ? 'FOR UPDATE OF i' : ''}
                LIMIT 1
            `,
            [issueId],
        );

        return result.rows[0] ?? null;
    }

    private async resolveCurrentUser(client: PoolClient, input: AuthenticatedUser): Promise<CurrentUser> {
        const userId = input.userId?.trim();
        const email = input.email?.trim().toLowerCase();

        if (!userId || !email) {
            throw fiduxKanbanError.unauthorized('Invalid authenticated user context');
        }

        const existing = await client.query<CurrentUser>(
            `
                SELECT id, email, name
                FROM "User"
                WHERE id = $1
                  AND email = $2
                LIMIT 1
            `,
            [userId, email],
        );

        if (!existing.rows[0]) {
            throw fiduxKanbanError.unauthorized('Authenticated user was not found');
        }

        return existing.rows[0];
    }

    private assertIssueNotArchived(issue: IssueRow) {
        if (!issue.archivedAt) {
            return;
        }

        throw fiduxKanbanError.conflict(
            'ISSUE_ARCHIVED',
            'Issue is archived and cannot be modified',
            {
                issueId: issue.id,
                archivedAt: issue.archivedAt,
            },
        );
    }

    private async autoArchiveStaleDoneIssues(client: PoolClient, projectId: string) {
        await client.query(
            `
                UPDATE "Issue"
                SET "archivedAt" = NOW(),
                    "archivedById" = NULL,
                    "archivedReason" = 'AUTO_DONE_14D',
                    version = version + 1,
                    "updatedAt" = NOW()
                WHERE "projectId" = $1
                  AND status = 'DONE'
                  AND "archivedAt" IS NULL
                  AND "updatedAt" <= NOW() - INTERVAL '14 days'
            `,
            [projectId],
        );
    }

    private async requireIssueLifecycleOwnerRole(
        client: PoolClient,
        projectId: string,
        userId: string,
    ) {
        const projectRoleResult = await client.query<{ role: ProjectRole }>(
            `
                SELECT role
                FROM "ProjectMembership"
                WHERE "projectId" = $1
                  AND "userId" = $2
                LIMIT 1
            `,
            [projectId, userId],
        );

        const orgRoleResult = await client.query<{ role: OrgRole }>(
            `
                SELECT om.role
                FROM "Project" p
                INNER JOIN "OrgMembership" om ON om."orgId" = p."orgId"
                WHERE p.id = $1
                  AND om."userId" = $2
                LIMIT 1
            `,
            [projectId, userId],
        );

        const projectRole = projectRoleResult.rows[0]?.role ?? null;
        const orgRole = orgRoleResult.rows[0]?.role ?? null;
        const isAllowed = projectRole === 'PROJECT_ADMIN' || orgRole === 'ORG_OWNER';

        if (!isAllowed) {
            throw fiduxKanbanError.forbidden(
                'FORBIDDEN',
                'Only ORG_OWNER or PROJECT_ADMIN can archive or delete issues',
                {
                    requiredRoles: ['ORG_OWNER', 'PROJECT_ADMIN'],
                    projectRole,
                    orgRole,
                },
            );
        }
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
            throw fiduxKanbanError.forbidden(
                'FORBIDDEN',
                'You are not a member of this project',
                { projectId },
            );
        }

        if (projectRoleRank[role] < projectRoleRank[minimumRole]) {
            throw fiduxKanbanError.forbidden(
                'FORBIDDEN',
                'Project role is insufficient for this action',
                {
                    minimumRole,
                    receivedRole: role,
                },
            );
        }

        return role;
    }

    private async assertAssigneeBelongsToProject(
        client: PoolClient,
        projectId: string,
        assigneeId: string,
    ) {
        const result = await client.query(
            `
                SELECT 1
                FROM "ProjectMembership"
                WHERE "projectId" = $1
                  AND "userId" = $2
                LIMIT 1
            `,
            [projectId, assigneeId],
        );

        if (!result.rows[0]) {
            throw fiduxKanbanError.badRequest(
                'VALIDATION_ERROR',
                'Assignee must be a member of this project',
                {
                    assigneeId,
                },
            );
        }
    }

    private async insertActivityLog(
        client: PoolClient,
        projectId: string,
        actorId: string,
        entityId: string,
        action:
            | 'ISSUE_CREATED'
            | 'ISSUE_STATUS_CHANGED'
            | 'ISSUE_ASSIGNEE_CHANGED'
            | 'ISSUE_PRIORITY_CHANGED'
            | 'ISSUE_TITLE_CHANGED',
        payload: Record<string, unknown>,
    ) {
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
                    $5,
                    $6::jsonb,
                    NOW()
                )
            `,
            [
                this.generateId('act'),
                projectId,
                actorId,
                entityId,
                action,
                JSON.stringify(payload),
            ],
        );
    }

    private normalizeDescription(value: string | null | undefined) {
        if (value === null || value === undefined) {
            return null;
        }

        const trimmed = value.trim();
        return trimmed.length === 0 ? null : trimmed;
    }

    private normalizeAssignee(value: string | null | undefined) {
        if (value === null || value === undefined) {
            return null;
        }

        const trimmed = value.trim();
        return trimmed.length === 0 ? null : trimmed;
    }

    private resolveSmtpPort(rawValue: string | undefined) {
        const parsed = Number.parseInt(rawValue ?? '465', 10);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
            return 465;
        }
        return parsed;
    }

    private toIssueResponse(issue: IssueRow) {
        return {
            id: issue.id,
            projectId: issue.projectId,
            title: issue.title,
            description: issue.description,
            status: issue.status,
            priority: issue.priority,
            assigneeId: issue.assigneeId,
            assignee:
                issue.assigneeId && issue.assigneeEmail
                    ? {
                          id: issue.assigneeId,
                          name: issue.assigneeName,
                          email: issue.assigneeEmail,
                      }
                    : null,
            archivedAt: issue.archivedAt,
            archivedById: issue.archivedById,
            archivedBy:
                issue.archivedById && issue.archivedByEmail
                    ? {
                          id: issue.archivedById,
                          name: issue.archivedByName,
                          email: issue.archivedByEmail,
                      }
                    : null,
            archivedReason: issue.archivedReason,
            assignedAt: issue.assignedAt,
            version: issue.version,
            createdAt: issue.createdAt,
            updatedAt: issue.updatedAt,
            figmaFileKey: issue.figmaFileKey,
            figmaNodeId: issue.figmaNodeId,
            figmaNodeName: issue.figmaNodeName,
            figmaDeepLink: issue.figmaDeepLink,
            thumbnailUrl: issue.thumbnailUrl,
        };
    }

    private toIssueMessageResponse(message: IssueMessageRow) {
        return {
            id: message.id,
            projectId: message.projectId,
            issueId: message.issueId,
            sender: {
                id: message.senderId,
                name: message.senderName,
                email: message.senderEmail,
            },
            content: message.content,
            createdAt: message.createdAt,
        };
    }

    private toIssueActivityResponseRow(
        row: IssueActivityRow,
        assigneeMap: Map<string, UserLookupRow>,
    ) {
        const fromId = this.extractPayloadString(row.payload, 'from');
        const toId = this.extractPayloadString(row.payload, 'to');
        const createdAssigneeId = this.extractPayloadString(row.payload, 'assigneeId');
        const field = this.extractPayloadString(row.payload, 'field');

        const fromAssignee = this.toAssigneeReference(fromId, assigneeMap);
        const toAssignee = this.toAssigneeReference(toId, assigneeMap);
        const createdAssignee = this.toAssigneeReference(createdAssigneeId, assigneeMap);

        return {
            id: row.id,
            action: row.action,
            createdAt: row.createdAt,
            actor: {
                id: row.actorId,
                name: row.actorName,
                email: row.actorEmail,
            },
            summary: this.buildIssueActivitySummary(row, fromAssignee, toAssignee, createdAssignee),
            details: {
                field,
                from: fromId ?? this.extractPayloadString(row.payload, 'from'),
                to: toId ?? this.extractPayloadString(row.payload, 'to'),
                title: this.extractPayloadString(row.payload, 'title'),
                status: this.extractPayloadString(row.payload, 'status'),
                priority: this.extractPayloadString(row.payload, 'priority'),
                source: this.extractPayloadString(row.payload, 'source'),
                fromAssignee,
                toAssignee,
                createdAssignee,
                raw: row.payload ?? {},
            },
        };
    }

    private buildIssueActivitySummary(
        row: IssueActivityRow,
        fromAssignee: { id: string; name: string | null; email: string; label: string } | null,
        toAssignee: { id: string; name: string | null; email: string; label: string } | null,
        createdAssignee: { id: string; name: string | null; email: string; label: string } | null,
    ) {
        switch (row.action) {
            case 'ISSUE_CREATED': {
                const createdWith = createdAssignee
                    ? ` and assigned to ${createdAssignee.label}`
                    : '';
                return `Issue created${createdWith}.`;
            }
            case 'ISSUE_ASSIGNEE_CHANGED': {
                const fromLabel = fromAssignee ? fromAssignee.label : 'Unassigned';
                const toLabel = toAssignee ? toAssignee.label : 'Unassigned';
                return `Assignee changed from ${fromLabel} to ${toLabel}.`;
            }
            case 'ISSUE_STATUS_CHANGED': {
                const from = this.extractPayloadString(row.payload, 'from') || 'Unknown';
                const to = this.extractPayloadString(row.payload, 'to') || 'Unknown';
                return `Status changed from ${from} to ${to}.`;
            }
            case 'ISSUE_PRIORITY_CHANGED': {
                const from = this.extractPayloadString(row.payload, 'from') || 'Unknown';
                const to = this.extractPayloadString(row.payload, 'to') || 'Unknown';
                return `Priority changed from ${from} to ${to}.`;
            }
            case 'ISSUE_TITLE_CHANGED': {
                const to = this.extractPayloadString(row.payload, 'to') || 'Updated title';
                return `Title updated to "${to}".`;
            }
            default:
                return 'Issue updated.';
        }
    }

    private toAssigneeReference(
        userId: string | null,
        assigneeMap: Map<string, UserLookupRow>,
    ) {
        if (!userId) {
            return null;
        }

        const user = assigneeMap.get(userId);
        if (!user) {
            return {
                id: userId,
                name: null,
                email: '',
                label: userId,
            };
        }

        return {
            id: user.id,
            name: user.name,
            email: user.email,
            label: user.name || user.email,
        };
    }

    private extractPayloadString(payload: Record<string, unknown> | null, key: string) {
        if (!payload || !(key in payload)) {
            return null;
        }

        const value = payload[key];
        if (typeof value !== 'string') {
            return null;
        }

        const trimmed = value.trim();
        return trimmed.length === 0 ? null : trimmed;
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
