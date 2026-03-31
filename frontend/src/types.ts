export type ThemeMode = 'light' | 'dark' | 'system';

export type IssueStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
export type IssuePriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type ProjectRole = 'PROJECT_VIEWER' | 'PROJECT_MEMBER' | 'PROJECT_ADMIN';
export type OrgRole = 'ORG_OWNER' | 'ORG_ADMIN' | 'ORG_MEMBER';

export type User = {
  id: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  hasPassword: boolean;
  hasGoogleLinked: boolean;
  emailVerified: boolean;
};

export type AuthResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: User;
  emailVerification?: {
    required: boolean;
    sent: boolean;
    delivery?: string;
    verifyUrl?: string;
    error?: string;
  };
};

export type ProjectSummary = {
  id: string;
  orgId: string;
  name: string;
  role: ProjectRole;
  createdAt: string;
};

export type OrganizationSummary = {
  id: string;
  name: string;
  role: OrgRole;
  createdAt: string;
};

export type OrgMember = {
  userId: string;
  email: string;
  name: string | null;
  imageUrl?: string | null;
  role: OrgRole;
  joinedAt: string;
};

export type ProjectMember = {
  userId: string;
  email: string;
  name: string | null;
  role: ProjectRole;
  joinedAt: string;
};

export type IssueAssignee = {
  id: string;
  name: string | null;
  email: string;
};

export type BoardIssue = {
  id: string;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeId: string | null;
  assignee: IssueAssignee | null;
  assignedAt: string | null;
  version: number;
  updatedAt: string;
  thumbnailUrl: string | null;
};

export type IssueDetail = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeId: string | null;
  assignee: IssueAssignee | null;
  archivedAt: string | null;
  archivedById: string | null;
  archivedBy: IssueAssignee | null;
  archivedReason: string | null;
  assignedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  figmaFileKey: string | null;
  figmaNodeId: string | null;
  figmaNodeName: string | null;
  figmaDeepLink: string | null;
  thumbnailUrl: string | null;
};

export type IssueMessage = {
  id: string;
  projectId: string;
  issueId: string;
  sender: {
    id: string;
    name: string | null;
    email: string;
  };
  content: string;
  createdAt: string;
};

export type IssueActivityEntry = {
  id: string;
  action:
    | 'ISSUE_CREATED'
    | 'ISSUE_STATUS_CHANGED'
    | 'ISSUE_ASSIGNEE_CHANGED'
    | 'ISSUE_PRIORITY_CHANGED'
    | 'ISSUE_TITLE_CHANGED';
  createdAt: string;
  actor: {
    id: string;
    name: string | null;
    email: string;
  };
  summary: string;
  details: {
    field: string | null;
    from: string | null;
    to: string | null;
    title: string | null;
    status: string | null;
    priority: string | null;
    source: string | null;
    fromAssignee: {
      id: string;
      name: string | null;
      email: string;
      label: string;
    } | null;
    toAssignee: {
      id: string;
      name: string | null;
      email: string;
      label: string;
    } | null;
    createdAssignee: {
      id: string;
      name: string | null;
      email: string;
      label: string;
    } | null;
    raw: Record<string, unknown>;
  };
};

export type MoveIssueResponse = {
  issue: {
    id: string;
    status: IssueStatus;
    version: number;
    updatedAt: string;
  };
};

export type UpdateIssuePayload = {
  title?: string;
  description?: string | null;
  status?: IssueStatus;
  priority?: IssuePriority;
  assigneeId?: string | null;
  expectedVersion?: number;
};

export type VersionConflictCurrent = {
  id: string;
  status: IssueStatus;
  version: number;
};

export type ProjectNotification = {
  id: string;
  type: 'ASSIGNED_TO_YOU';
  message: string;
  issue: {
    id: string;
    title: string;
  };
  actor: {
    id: string;
    name: string | null;
    email: string;
  };
  createdAt: string;
  payload: Record<string, unknown>;
};
