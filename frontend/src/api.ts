import {
  AuthResponse,
  BoardIssue,
  IssueDetail,
  IssueActivityEntry,
  IssueMessage,
  IssueStatus,
  MoveIssueResponse,
  OrgMember,
  ProjectNotification,
  OrganizationSummary,
  ProjectSummary,
  ProjectMember,
  ProjectRole,
  OrgRole,
  UpdateIssuePayload,
  VersionConflictCurrent,
} from './types';

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;
  current?: VersionConflictCurrent;

  constructor(message: string, status: number, code: string, details: unknown, current?: VersionConflictCurrent) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.current = current;
  }
}

type RequestOptions = {
  baseUrl: string;
  path: string;
  method?: string;
  token?: string;
  body?: unknown;
};

async function request<T>(options: RequestOptions): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${options.baseUrl}${options.path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data: any = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const envelope = data?.error ?? null;
    const code = envelope?.code ?? `HTTP_${response.status}`;
    const message = envelope?.message ?? 'Request failed';
    const details = envelope?.details ?? null;
    const current = data?.current;
    throw new ApiError(message, response.status, code, details, current);
  }

  return data as T;
}

export async function loginWithPassword(baseUrl: string, email: string, password: string) {
  return request<AuthResponse>({
    baseUrl,
    path: '/auth/login',
    method: 'POST',
    body: { email, password },
  });
}

export async function registerWithPassword(
  baseUrl: string,
  name: string,
  email: string,
  password: string,
) {
  return request<AuthResponse>({
    baseUrl,
    path: '/auth/register',
    method: 'POST',
    body: { name, email, password },
  });
}

export async function getMe(baseUrl: string, token: string) {
  return request<{ user: AuthResponse['user'] }>({
    baseUrl,
    path: '/auth/me',
    token,
  });
}

export async function changePassword(
  baseUrl: string,
  token: string,
  currentPassword: string,
  newPassword: string,
) {
  return request<{
    changed: boolean;
    user: AuthResponse['user'];
  }>({
    baseUrl,
    path: '/auth/change-password',
    method: 'POST',
    token,
    body: { currentPassword, newPassword },
  });
}

export async function resendVerificationEmail(baseUrl: string, token: string) {
  return request<{
    required: boolean;
    sent: boolean;
    alreadyVerified: boolean;
    delivery?: string;
    verifyUrl?: string;
    error?: string;
  }>({
    baseUrl,
    path: '/auth/email/verification/resend',
    method: 'POST',
    token,
  });
}

export async function verifyEmailToken(baseUrl: string, verifyToken: string) {
  return request<{
    verified: boolean;
    user: AuthResponse['user'];
  }>({
    baseUrl,
    path: `/auth/verify-email?token=${encodeURIComponent(verifyToken)}`,
    method: 'GET',
  });
}

export async function listProjects(baseUrl: string, token: string) {
  return request<{ projects: ProjectSummary[] }>({
    baseUrl,
    path: '/projects',
    token,
  });
}

export async function listProjectIssues(baseUrl: string, token: string, projectId: string) {
  return request<{ issues: BoardIssue[] }>({
    baseUrl,
    path: `/projects/${encodeURIComponent(projectId)}/issues`,
    token,
  });
}

export async function listProjectParticipants(baseUrl: string, token: string, projectId: string) {
  return request<{ members: ProjectMember[] }>({
    baseUrl,
    path: `/projects/${encodeURIComponent(projectId)}/participants`,
    token,
  });
}

export async function listProjectNotifications(
  baseUrl: string,
  token: string,
  projectId: string,
  limit = 50,
) {
  return request<{ notifications: ProjectNotification[] }>({
    baseUrl,
    path: `/projects/${encodeURIComponent(projectId)}/notifications?limit=${encodeURIComponent(String(limit))}`,
    token,
  });
}

export async function getIssue(baseUrl: string, token: string, issueId: string) {
  return request<{ issue: IssueDetail }>({
    baseUrl,
    path: `/issues/${encodeURIComponent(issueId)}`,
    token,
  });
}

export async function listIssueMessages(baseUrl: string, token: string, issueId: string) {
  return request<{ messages: IssueMessage[] }>({
    baseUrl,
    path: `/issues/${encodeURIComponent(issueId)}/messages`,
    token,
  });
}

export async function listIssueActivity(baseUrl: string, token: string, issueId: string) {
  return request<{ activity: IssueActivityEntry[] }>({
    baseUrl,
    path: `/issues/${encodeURIComponent(issueId)}/activity`,
    token,
  });
}

export async function sendIssueMessage(baseUrl: string, token: string, issueId: string, content: string) {
  return request<{ message: IssueMessage }>({
    baseUrl,
    path: `/issues/${encodeURIComponent(issueId)}/messages`,
    method: 'POST',
    token,
    body: { content },
  });
}

export async function moveIssue(
  baseUrl: string,
  token: string,
  issueId: string,
  toStatus: IssueStatus,
  expectedVersion: number,
) {
  return request<MoveIssueResponse>({
    baseUrl,
    path: `/issues/${encodeURIComponent(issueId)}/move`,
    method: 'POST',
    token,
    body: {
      toStatus,
      expectedVersion,
    },
  });
}

export async function patchIssue(
  baseUrl: string,
  token: string,
  issueId: string,
  payload: UpdateIssuePayload,
) {
  return request<{ issue: IssueDetail }>({
    baseUrl,
    path: `/issues/${encodeURIComponent(issueId)}`,
    method: 'PATCH',
    token,
    body: payload,
  });
}

export async function archiveIssue(baseUrl: string, token: string, issueId: string) {
  return request<{
    archived: boolean;
    issue: IssueDetail;
  }>({
    baseUrl,
    path: `/issues/${encodeURIComponent(issueId)}/archive`,
    method: 'POST',
    token,
  });
}

export async function deleteIssue(baseUrl: string, token: string, issueId: string) {
  return request<{
    deleted: boolean;
    issueId: string;
    projectId: string;
  }>({
    baseUrl,
    path: `/issues/${encodeURIComponent(issueId)}`,
    method: 'DELETE',
    token,
  });
}

export async function listMyOrganizations(baseUrl: string, token: string) {
  return request<{ organizations: OrganizationSummary[] }>({
    baseUrl,
    path: '/orgs/mine',
    token,
  });
}

export async function createOrganization(baseUrl: string, token: string, name: string) {
  return request<{
    organization: {
      id: string;
      name: string;
    };
    membership: {
      role: OrgRole;
    };
  }>({
    baseUrl,
    path: '/orgs',
    method: 'POST',
    token,
    body: { name },
  });
}

export async function createProject(baseUrl: string, token: string, orgId: string, name: string) {
  return request<{
    project: {
      id: string;
      orgId: string;
      name: string;
    };
    actorRole: OrgRole;
  }>({
    baseUrl,
    path: `/orgs/${encodeURIComponent(orgId)}/projects`,
    method: 'POST',
    token,
    body: { name },
  });
}

export async function listOrgMembers(baseUrl: string, token: string, orgId: string) {
  return request<{ members: OrgMember[] }>({
    baseUrl,
    path: `/orgs/${encodeURIComponent(orgId)}/members`,
    token,
  });
}

export async function addOrgMember(
  baseUrl: string,
  token: string,
  orgId: string,
  email: string,
  role: 'ORG_ADMIN' | 'ORG_MEMBER',
) {
  return request<{
    member: {
      userId: string;
      email: string;
      name: string | null;
      role: 'ORG_ADMIN' | 'ORG_MEMBER';
    };
  }>({
    baseUrl,
    path: `/orgs/${encodeURIComponent(orgId)}/members`,
    method: 'POST',
    token,
    body: { email, role },
  });
}

export async function updateOrgMemberRole(
  baseUrl: string,
  token: string,
  orgId: string,
  userId: string,
  role: 'ORG_ADMIN' | 'ORG_MEMBER',
) {
  return request<{ updated: true; userId: string; role: 'ORG_ADMIN' | 'ORG_MEMBER' }>({
    baseUrl,
    path: `/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}/role`,
    method: 'PATCH',
    token,
    body: { role },
  });
}

export async function listProjectMembers(baseUrl: string, token: string, projectId: string) {
  return request<{ members: ProjectMember[] }>({
    baseUrl,
    path: `/projects/${encodeURIComponent(projectId)}/members`,
    token,
  });
}

export async function addProjectMember(
  baseUrl: string,
  token: string,
  projectId: string,
  email: string,
  role: ProjectRole,
) {
  return request<{
    member: {
      userId: string;
      email: string;
      name: string | null;
      role: ProjectRole;
    };
  }>({
    baseUrl,
    path: `/projects/${encodeURIComponent(projectId)}/members`,
    method: 'POST',
    token,
    body: { email, role },
  });
}

export async function updateProjectMemberRole(
  baseUrl: string,
  token: string,
  projectId: string,
  userId: string,
  role: ProjectRole,
) {
  return request<{ updated: true; userId: string; role: ProjectRole }>({
    baseUrl,
    path: `/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}/role`,
    method: 'PATCH',
    token,
    body: { role },
  });
}
