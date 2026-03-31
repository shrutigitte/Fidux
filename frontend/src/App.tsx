import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  addOrgMember,
  addProjectMember,
  archiveIssue as archiveIssueApi,
  ApiError,
  changePassword,
  createOrganization,
  createProject,
  deleteIssue as deleteIssueApi,
  getIssue,
  getMe,
  listIssueActivity,
  listIssueMessages,
  listMyOrganizations,
  listOrgMembers,
  listProjectIssues,
  listProjectNotifications,
  listProjectMembers,
  listProjectParticipants,
  listProjects,
  loginWithPassword,
  moveIssue,
  patchIssue,
  registerWithPassword,
  resendVerificationEmail,
  sendIssueMessage,
  updateOrgMemberRole,
  updateProjectMemberRole,
  verifyEmailToken,
} from './api';
import {
  BoardIssue,
  IssueDetail,
  IssueActivityEntry,
  IssueMessage,
  IssuePriority,
  IssueStatus,
  OrgMember,
  OrganizationSummary,
  ProjectNotification,
  ProjectMember,
  ProjectRole,
  ProjectSummary,
  ThemeMode,
  UpdateIssuePayload,
  User,
} from './types';

type Toast = {
  type: 'success' | 'error' | 'info';
  message: string;
};

type IssueDraft = {
  title: string;
  description: string;
  priority: IssuePriority;
  status: IssueStatus;
  assigneeId: string;
};

type AuthMode = 'login' | 'signup' | 'token';
type IssuePanelMode = 'drawer' | 'full';

const STORAGE = {
  apiBase: 'fidux_api_base',
  token: 'fidux_access_token',
  theme: 'fidux_theme_mode',
};

const CONFIGURED_API_BASE = (import.meta.env.VITE_API_BASE || '').trim();

const STATUS_META: Array<{ key: IssueStatus; label: string; className: string }> = [
  { key: 'TODO', label: 'To Do', className: 'todo' },
  { key: 'IN_PROGRESS', label: 'In Progress', className: 'inprogress' },
  { key: 'REVIEW', label: 'Review', className: 'review' },
  { key: 'DONE', label: 'Done', className: 'done' },
];

const ORG_ASSIGNABLE_ROLES: Array<'ORG_ADMIN' | 'ORG_MEMBER'> = ['ORG_ADMIN', 'ORG_MEMBER'];
const PROJECT_ASSIGNABLE_ROLES: ProjectRole[] = ['PROJECT_ADMIN', 'PROJECT_MEMBER', 'PROJECT_VIEWER'];

function readLocalStorage(key: string, fallback: string) {
  const value = localStorage.getItem(key);
  return value && value.trim().length > 0 ? value : fallback;
}

function resolveDefaultApiBase() {
  if (CONFIGURED_API_BASE) {
    return CONFIGURED_API_BASE.replace(/\/$/, '');
  }

  return '/api';
}

function shouldDiscardLegacyLocalApiBase(apiBase: string) {
  if (typeof window === 'undefined') {
    return false;
  }

  const hostname = window.location.hostname.toLowerCase();
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
  if (isLocalHost) {
    return false;
  }

  return apiBase === 'http://localhost:3002/api' || apiBase === 'http://127.0.0.1:3002/api';
}

function normalizeApiBase(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return resolveDefaultApiBase();
  }

  return trimmed.replace(/\/$/, '');
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;

  if (mode === 'light') {
    root.setAttribute('data-theme', 'light');
    return;
  }

  if (mode === 'dark') {
    root.setAttribute('data-theme', 'dark');
    return;
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
}

function getIssueFigmaLink(issue: IssueDetail | null) {
  if (!issue) return '';

  if (issue.figmaDeepLink && issue.figmaDeepLink.trim()) {
    return issue.figmaDeepLink;
  }

  if (issue.figmaFileKey && issue.figmaNodeId) {
    return `https://www.figma.com/file/${encodeURIComponent(issue.figmaFileKey)}?node-id=${encodeURIComponent(issue.figmaNodeId)}`;
  }

  return '';
}

function getIssueFigmaEmbedUrl(issue: IssueDetail | null) {
  const link = getIssueFigmaLink(issue);
  if (!link) return '';
  return `https://www.figma.com/embed?embed_host=fidux&url=${encodeURIComponent(link)}`;
}

function humanizeApiError(error: unknown) {
  if (error instanceof ApiError) {
    return `${error.code}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}

function shortId(value: string, visible = 18) {
  if (!value) return '';
  if (value.length <= visible) return value;
  const head = Math.max(6, Math.floor(visible / 2));
  const tail = Math.max(4, visible - head - 1);
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function readIssueDeepLinkFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const issueId = params.get('issueId')?.trim() || '';
  const projectId = params.get('projectId')?.trim() || '';
  const requestedView = params.get('view')?.trim().toLowerCase();
  const view: IssuePanelMode = requestedView === 'drawer' ? 'drawer' : 'full';

  return {
    issueId,
    projectId,
    view,
  };
}

function readVerificationTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('verifyEmailToken')?.trim() || '';
}

function clearVerificationTokenFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('verifyEmailToken');
  window.history.replaceState({}, '', url.toString());
}

export default function App() {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [mainTab, setMainTab] = useState<'dashboard' | 'admin' | 'notifications' | 'profile'>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [apiBase, setApiBase] = useState(resolveDefaultApiBase());
  const [token, setToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);

  const [activeProjectId, setActiveProjectId] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState('');

  const [issues, setIssues] = useState<BoardIssue[]>([]);
  const [notifications, setNotifications] = useState<ProjectNotification[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [projectParticipants, setProjectParticipants] = useState<ProjectMember[]>([]);

  const [newOrgName, setNewOrgName] = useState('');
  const [newProjectName, setNewProjectName] = useState('');

  const [orgInviteEmail, setOrgInviteEmail] = useState('');
  const [orgInviteRole, setOrgInviteRole] = useState<'ORG_ADMIN' | 'ORG_MEMBER'>('ORG_MEMBER');

  const [projectInviteEmail, setProjectInviteEmail] = useState('');
  const [projectInviteRole, setProjectInviteRole] = useState<ProjectRole>('PROJECT_MEMBER');

  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserOrgRole, setNewUserOrgRole] = useState<'ORG_ADMIN' | 'ORG_MEMBER'>('ORG_MEMBER');
  const [newUserProjectRole, setNewUserProjectRole] = useState<ProjectRole>('PROJECT_MEMBER');
  const [createUserAlsoProject, setCreateUserAlsoProject] = useState(true);

  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');

  const [loadingSession, setLoadingSession] = useState(false);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [savingIssue, setSavingIssue] = useState(false);
  const [movingIssueId, setMovingIssueId] = useState('');
  const [busyIssueLifecycleAction, setBusyIssueLifecycleAction] = useState('');
  const [busyAdminAction, setBusyAdminAction] = useState('');
  const [busySecurityAction, setBusySecurityAction] = useState('');

  const [selectedIssueId, setSelectedIssueId] = useState('');
  const [issueDetail, setIssueDetail] = useState<IssueDetail | null>(null);
  const [issueDraft, setIssueDraft] = useState<IssueDraft | null>(null);
  const [issueMessages, setIssueMessages] = useState<IssueMessage[]>([]);
  const [issueActivity, setIssueActivity] = useState<IssueActivityEntry[]>([]);
  const [issueMessageDraft, setIssueMessageDraft] = useState('');
  const [issueTagMemberId, setIssueTagMemberId] = useState('');
  const [loadingIssueDetail, setLoadingIssueDetail] = useState(false);
  const [loadingIssueMessages, setLoadingIssueMessages] = useState(false);
  const [loadingIssueActivity, setLoadingIssueActivity] = useState(false);
  const [sendingIssueMessage, setSendingIssueMessage] = useState(false);
  const [issuePanelMode, setIssuePanelMode] = useState<IssuePanelMode>('drawer');
  const [deepLinkIssueId, setDeepLinkIssueId] = useState('');
  const [deepLinkProjectId, setDeepLinkProjectId] = useState('');
  const [deepLinkView, setDeepLinkView] = useState<IssuePanelMode>('full');
  const [pendingVerifyEmailToken, setPendingVerifyEmailToken] = useState('');
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    const savedTheme = readLocalStorage(STORAGE.theme, 'system') as ThemeMode;
    const rawSavedApiBase = readLocalStorage(STORAGE.apiBase, resolveDefaultApiBase());
    const savedApiBase = shouldDiscardLegacyLocalApiBase(rawSavedApiBase)
      ? resolveDefaultApiBase()
      : normalizeApiBase(rawSavedApiBase);
    const savedToken = readLocalStorage(STORAGE.token, '');

    setThemeMode(savedTheme);
    setApiBase(savedApiBase);
    applyTheme(savedTheme);
    localStorage.setItem(STORAGE.apiBase, savedApiBase);

    const deepLink = readIssueDeepLinkFromUrl();
    if (deepLink.issueId) {
      setDeepLinkIssueId(deepLink.issueId);
      setDeepLinkProjectId(deepLink.projectId);
      setDeepLinkView(deepLink.view);
    }

    const verifyEmailTokenFromUrl = readVerificationTokenFromUrl();
    if (verifyEmailTokenFromUrl) {
      setPendingVerifyEmailToken(verifyEmailTokenFromUrl);
    }

    if (savedToken) {
      setToken(savedToken);
      setTokenInput(savedToken);
      void bootstrapSession(savedToken, savedApiBase).catch(() => {
        localStorage.removeItem(STORAGE.token);
        setToken('');
        setTokenInput('');
        setAuthMode('login');
      });
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => {
      const mode = (localStorage.getItem(STORAGE.theme) as ThemeMode) || 'system';
      if (mode === 'system') {
        applyTheme('system');
      }
    };

    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  useEffect(() => {
    applyTheme(themeMode);
    localStorage.setItem(STORAGE.theme, themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (!token || !activeProjectId) {
      return;
    }

    void loadIssues(activeProjectId);
    void loadProjectParticipants(activeProjectId);
    void loadProjectNotifications(activeProjectId);
  }, [activeProjectId]);

  useEffect(() => {
    if (!logoutConfirmOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLogoutConfirmOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [logoutConfirmOpen]);

  useEffect(() => {
    if (!pendingVerifyEmailToken) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await verifyEmailToken(normalizeApiBase(apiBase), pendingVerifyEmailToken);
        if (cancelled) {
          return;
        }

        setUser((currentUser) => (currentUser && currentUser.id === response.user.id ? response.user : currentUser));
        setAuthMode('login');
        setToast({ type: 'success', message: 'Email verified successfully. You can continue in Fidux now.' });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setToast({ type: 'error', message: `Email verification failed: ${humanizeApiError(error)}` });
      } finally {
        if (!cancelled) {
          clearVerificationTokenFromUrl();
          setPendingVerifyEmailToken('');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pendingVerifyEmailToken, apiBase]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [mainTab, token]);

  useEffect(() => {
    if (!token || loadingSession || !deepLinkIssueId) {
      return;
    }

    if (deepLinkProjectId && activeProjectId !== deepLinkProjectId) {
      const hasProject = projects.some((project) => project.id === deepLinkProjectId);
      if (hasProject) {
        setActiveProjectId(deepLinkProjectId);
        return;
      }
    }

    const targetIssueId = deepLinkIssueId;
    const targetView = deepLinkView;

    setDeepLinkIssueId('');
    setDeepLinkProjectId('');

    void openIssue(targetIssueId, targetView).finally(() => {
      if (window.location.search.includes('issueId=')) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    });
  }, [
    token,
    loadingSession,
    deepLinkIssueId,
    deepLinkProjectId,
    deepLinkView,
    activeProjectId,
    projects,
  ]);

  useEffect(() => {
    if (!token || !selectedOrgId) {
      return;
    }

    const selectedOrgForMembers = organizations.find((org) => org.id === selectedOrgId) || null;
    const canLoadOrgMembers = Boolean(
      selectedOrgForMembers &&
        (selectedOrgForMembers.role === 'ORG_OWNER' || selectedOrgForMembers.role === 'ORG_ADMIN'),
    );

    if (!canLoadOrgMembers) {
      setOrgMembers([]);
      return;
    }

    void loadOrgMembers(selectedOrgId);
  }, [organizations, selectedOrgId, token]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const groupedIssues = useMemo(() => {
    const map: Record<IssueStatus, BoardIssue[]> = {
      TODO: [],
      IN_PROGRESS: [],
      REVIEW: [],
      DONE: [],
    };

    for (const issue of issues) {
      map[issue.status].push(issue);
    }

    for (const key of Object.keys(map) as IssueStatus[]) {
      map[key].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }

    return map;
  }, [issues]);

  const boardMetrics = useMemo(() => {
    const total = issues.length;
    const active = issues.filter((issue) => issue.status !== 'DONE').length;
    const done = issues.filter((issue) => issue.status === 'DONE').length;
    const highPriority = issues.filter((issue) => issue.priority === 'HIGH').length;
    const unassigned = issues.filter((issue) => !issue.assigneeId).length;

    return {
      total,
      active,
      done,
      highPriority,
      unassigned,
    };
  }, [issues]);

  const selectedOrg = organizations.find((org) => org.id === selectedOrgId) || null;
  const activeProject = projects.find((project) => project.id === activeProjectId) || null;

  const canManageOrg = selectedOrg ? selectedOrg.role === 'ORG_OWNER' || selectedOrg.role === 'ORG_ADMIN' : false;
  const canChangeOrgRoles = selectedOrg ? selectedOrg.role === 'ORG_OWNER' : false;

  const canManageProject = activeProject
    ? activeProject.role === 'PROJECT_ADMIN' || canManageOrg
    : false;
  const canSendIssueMessages = activeProject
    ? activeProject.role === 'PROJECT_ADMIN' || activeProject.role === 'PROJECT_MEMBER'
    : false;
  const canInviteOrgMembers = Boolean(selectedOrgId) && canManageOrg;
  const canInviteProjectMembers = Boolean(activeProjectId) && canManageProject;
  const canArchiveOrDeleteIssue = Boolean(activeProjectId) &&
    (selectedOrg?.role === 'ORG_OWNER' || activeProject?.role === 'PROJECT_ADMIN');
  const participantById = useMemo(() => {
    const map = new Map<string, ProjectMember>();
    for (const member of projectParticipants) {
      map.set(member.userId, member);
    }
    return map;
  }, [projectParticipants]);

  const resolveAssigneeName = (assigneeId: string | null, fallback?: { name: string | null; email: string } | null) => {
    if (!assigneeId) {
      return 'Unassigned';
    }

    if (fallback) {
      return fallback.name || fallback.email;
    }

    const participant = participantById.get(assigneeId);
    if (participant) {
      return participant.name || participant.email;
    }

    return `Unknown member (${shortId(assigneeId, 16)})`;
  };

  const formatAssignedAge = (assignedAt: string | null) => {
    if (!assignedAt) {
      return 'Not assigned yet';
    }

    const start = new Date(assignedAt).getTime();
    if (Number.isNaN(start)) {
      return 'Assigned date unavailable';
    }

    const elapsedDays = Math.floor((Date.now() - start) / (24 * 60 * 60 * 1000));
    if (elapsedDays <= 0) {
      return 'Assigned today';
    }

    return `Assigned ${elapsedDays} day${elapsedDays === 1 ? '' : 's'} ago`;
  };

  const fullIssueRail = useMemo(
    () =>
      [...issues].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [issues],
  );

  const renderTaggedMessage = (content: string) => {
    const parts = content.split(/(@[A-Za-z0-9_.@-]+)/g);
    return parts.map((part, index) => {
      if (/^@[A-Za-z0-9_.@-]+$/.test(part)) {
        return (
          <span key={`${part}-${index}`} className="chatTag">
            {part}
          </span>
        );
      }

      return <span key={`${part}-${index}`}>{part}</span>;
    });
  };

  const activityActorLabel = (entry: IssueActivityEntry) =>
    entry.actor.name || entry.actor.email;

  const assigneeOptions = useMemo(() => {
    const known = projectParticipants.map((member) => ({
      userId: member.userId,
      label: `${member.name || member.email} (${member.role})`,
    }));

    const currentAssigneeId = issueDraft?.assigneeId?.trim() || '';
    if (currentAssigneeId && !known.some((member) => member.userId === currentAssigneeId)) {
      const fallback = issueDetail?.assigneeId === currentAssigneeId ? issueDetail.assignee : null;
      known.unshift({
        userId: currentAssigneeId,
        label: `${resolveAssigneeName(currentAssigneeId, fallback)} (${shortId(currentAssigneeId, 10)})`,
      });
    }

    return known;
  }, [projectParticipants, issueDraft?.assigneeId, issueDetail?.assigneeId, issueDetail?.assignee]);

  async function bootstrapSession(nextToken: string, rawApiBase?: string) {
    const normalizedApiBase = normalizeApiBase(rawApiBase ?? apiBase);
    setLoadingSession(true);

    try {
      const [meResponse, projectsResponse, orgsResponse] = await Promise.all([
        getMe(normalizedApiBase, nextToken),
        listProjects(normalizedApiBase, nextToken),
        listMyOrganizations(normalizedApiBase, nextToken),
      ]);

      setUser(meResponse.user);
      setProjects(projectsResponse.projects);
      setOrganizations(orgsResponse.organizations);

      const firstProject = projectsResponse.projects[0] ?? null;
      setActiveProjectId(firstProject ? firstProject.id : '');

      const projectOrgId = firstProject?.orgId || '';
      const firstOrg = orgsResponse.organizations[0] ?? null;
      setSelectedOrgId(projectOrgId || (firstOrg ? firstOrg.id : ''));

      setToast({ type: 'success', message: 'Session ready.' });
    } catch (error) {
      setUser(null);
      setProjects([]);
      setOrganizations([]);
      setActiveProjectId('');
      setSelectedOrgId('');
      setIssues([]);
      setOrgMembers([]);
      setProjectMembers([]);
      setIssueDetail(null);
      setIssueDraft(null);
      setSelectedIssueId('');
      setToast({ type: 'error', message: `Session failed: ${humanizeApiError(error)}` });
      throw error;
    } finally {
      setLoadingSession(false);
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    const normalizedApiBase = normalizeApiBase(apiBase);
    setLoadingSession(true);

    try {
      const auth = await loginWithPassword(normalizedApiBase, loginEmail.trim(), loginPassword);
      localStorage.setItem(STORAGE.apiBase, normalizedApiBase);
      localStorage.setItem(STORAGE.token, auth.accessToken);

      setApiBase(normalizedApiBase);
      setToken(auth.accessToken);
      setTokenInput(auth.accessToken);
      setLoginPassword('');

      await bootstrapSession(auth.accessToken, normalizedApiBase);
      setToast({ type: 'success', message: `Logged in as ${auth.user.email}` });
    } catch (error) {
      setToast({ type: 'error', message: `Login failed: ${humanizeApiError(error)}` });
      setLoadingSession(false);
    }
  }

  async function handleSignup(event: FormEvent) {
    event.preventDefault();
    const normalizedApiBase = normalizeApiBase(apiBase);
    setLoadingSession(true);

    try {
      const auth = await registerWithPassword(
        normalizedApiBase,
        signupName.trim(),
        signupEmail.trim(),
        signupPassword,
      );

      localStorage.setItem(STORAGE.apiBase, normalizedApiBase);
      localStorage.setItem(STORAGE.token, auth.accessToken);

      setApiBase(normalizedApiBase);
      setToken(auth.accessToken);
      setTokenInput(auth.accessToken);
      setLoginEmail(auth.user.email);
      setLoginPassword('');
      setSignupPassword('');

      await bootstrapSession(auth.accessToken, normalizedApiBase);
      const verificationStatus = auth.emailVerification;
      const signupMessage =
        verificationStatus?.sent || verificationStatus?.delivery === 'queued'
          ? `Account created for ${auth.user.email}. Verification email is on the way.`
          : `Account created for ${auth.user.email}.`;
      setToast({
        type: 'success',
        message: signupMessage,
      });
    } catch (error) {
      setToast({ type: 'error', message: `Signup failed: ${humanizeApiError(error)}` });
      setLoadingSession(false);
    }
  }

  async function handleUseToken(event: FormEvent) {
    event.preventDefault();
    const normalizedApiBase = normalizeApiBase(apiBase);
    const nextToken = tokenInput.trim();

    if (!nextToken) {
      setToast({ type: 'error', message: 'Paste access token first.' });
      return;
    }

    localStorage.setItem(STORAGE.apiBase, normalizedApiBase);
    localStorage.setItem(STORAGE.token, nextToken);

    setApiBase(normalizedApiBase);
    setToken(nextToken);

    try {
      await bootstrapSession(nextToken, normalizedApiBase);
    } catch {
      localStorage.removeItem(STORAGE.token);
      setToken('');
      setTokenInput('');
    }
  }

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();

    if (newPasswordInput.length < 8) {
      setToast({ type: 'error', message: 'New password must be at least 8 characters.' });
      return;
    }

    if (newPasswordInput !== confirmPasswordInput) {
      setToast({ type: 'error', message: 'New password and confirm password must match.' });
      return;
    }

    setBusySecurityAction('change-password');
    try {
      const response = await changePassword(
        normalizeApiBase(apiBase),
        token,
        currentPasswordInput,
        newPasswordInput,
      );
      setUser(response.user);
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      setToast({ type: 'success', message: 'Password changed successfully.' });
    } catch (error) {
      setToast({ type: 'error', message: `Password change failed: ${humanizeApiError(error)}` });
    } finally {
      setBusySecurityAction('');
    }
  }

  async function handleResendVerificationEmail() {
    setBusySecurityAction('resend-verification');
    try {
      const response = await resendVerificationEmail(normalizeApiBase(apiBase), token);

      if (response.alreadyVerified) {
        setToast({ type: 'info', message: 'Email already verified.' });
        return;
      }

      if (response.sent && response.verifyUrl) {
        setToast({ type: 'info', message: `Verification link generated: ${response.verifyUrl}` });
        return;
      }

      if (response.sent) {
        setToast({ type: 'success', message: 'Verification email sent.' });
        return;
      }

      setToast({ type: 'error', message: response.error || 'Verification email could not be sent.' });
    } catch (error) {
      setToast({ type: 'error', message: `Resend failed: ${humanizeApiError(error)}` });
    } finally {
      setBusySecurityAction('');
    }
  }

  function performLogout() {
    localStorage.removeItem(STORAGE.token);
    setToken('');
    setTokenInput('');
    setUser(null);
    setProjects([]);
    setOrganizations([]);
    setIssues([]);
    setNotifications([]);
    setOrgMembers([]);
    setProjectMembers([]);
    setProjectParticipants([]);
    setActiveProjectId('');
    setSelectedOrgId('');
    setBusyIssueLifecycleAction('');
    setIssueDetail(null);
    setIssueDraft(null);
    setSelectedIssueId('');
    setToast({ type: 'info', message: 'Logged out.' });
  }

  function handleLogout() {
    setLogoutConfirmOpen(true);
  }

  function cancelLogout() {
    setLogoutConfirmOpen(false);
  }

  function confirmLogout() {
    setLogoutConfirmOpen(false);
    performLogout();
  }

  function selectMainTab(nextTab: 'dashboard' | 'admin' | 'notifications' | 'profile') {
    setMainTab(nextTab);
    setMobileNavOpen(false);
  }

  const renderNotificationButton = (extraClass?: string) => (
    <button
      type="button"
      role="tab"
      className={`mainTab notificationTab ${mainTab === 'notifications' ? 'active' : ''} ${extraClass ?? ''}`.trim()}
      aria-selected={mainTab === 'notifications'}
      aria-label={`Notifications${notifications.length > 0 ? ` (${notifications.length})` : ''}`}
      onClick={() => selectMainTab('notifications')}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="notifBellIcon">
        <path d="M12 3a5 5 0 0 0-5 5v2.49c0 .9-.36 1.76-1 2.39l-.7.7A1 1 0 0 0 6 15h12a1 1 0 0 0 .7-1.71l-.7-.7c-.64-.63-1-1.49-1-2.39V8a5 5 0 0 0-5-5zm0 18a3 3 0 0 0 2.82-2h-5.64A3 3 0 0 0 12 21z" />
      </svg>
      {notifications.length > 0 ? <span className="notifBadge">{notifications.length}</span> : null}
    </button>
  );

  async function refreshAdminData() {
    const normalizedApiBase = normalizeApiBase(apiBase);
    const [projectsResponse, orgsResponse] = await Promise.all([
      listProjects(normalizedApiBase, token),
      listMyOrganizations(normalizedApiBase, token),
    ]);

    setProjects(projectsResponse.projects);
    setOrganizations(orgsResponse.organizations);

    if (!selectedOrgId && orgsResponse.organizations[0]) {
      setSelectedOrgId(orgsResponse.organizations[0].id);
    }

    if (!activeProjectId && projectsResponse.projects[0]) {
      setActiveProjectId(projectsResponse.projects[0].id);
    }
  }

  async function loadIssues(projectId: string) {
    setLoadingIssues(true);

    try {
      const response = await listProjectIssues(normalizeApiBase(apiBase), token, projectId);
      setIssues(response.issues);
    } catch (error) {
      setToast({ type: 'error', message: `Failed to load issues: ${humanizeApiError(error)}` });
    } finally {
      setLoadingIssues(false);
    }
  }

  async function loadOrgMembers(orgId: string) {
    setLoadingMembers(true);
    try {
      const response = await listOrgMembers(normalizeApiBase(apiBase), token, orgId);
      setOrgMembers(response.members);
    } catch (error) {
      setOrgMembers([]);
      setToast({ type: 'error', message: `Failed to load org members: ${humanizeApiError(error)}` });
    } finally {
      setLoadingMembers(false);
    }
  }

  async function loadProjectMembers(projectId: string) {
    try {
      const response = await listProjectMembers(normalizeApiBase(apiBase), token, projectId);
      setProjectMembers(response.members);
    } catch (error) {
      setProjectMembers([]);
      setToast({ type: 'error', message: `Failed to load project members: ${humanizeApiError(error)}` });
    }
  }

  async function loadProjectParticipants(projectId: string) {
    try {
      const response = await listProjectParticipants(normalizeApiBase(apiBase), token, projectId);
      setProjectParticipants(response.members);
    } catch (error) {
      try {
        const fallback = await listProjectMembers(normalizeApiBase(apiBase), token, projectId);
        setProjectParticipants(fallback.members);
      } catch (fallbackError) {
        setProjectParticipants([]);
        setToast({ type: 'error', message: `Failed to load assignable members: ${humanizeApiError(fallbackError)}` });
      }
    }
  }

  async function loadProjectNotifications(projectId: string) {
    setLoadingNotifications(true);
    try {
      const response = await listProjectNotifications(normalizeApiBase(apiBase), token, projectId, 50);
      setNotifications(response.notifications);
    } catch (error) {
      setNotifications([]);
      setToast({ type: 'error', message: `Failed to load notifications: ${humanizeApiError(error)}` });
    } finally {
      setLoadingNotifications(false);
    }
  }

  async function handleCreateOrganization(event: FormEvent) {
    event.preventDefault();
    if (!newOrgName.trim()) return;

    setBusyAdminAction('create-org');
    try {
      await createOrganization(normalizeApiBase(apiBase), token, newOrgName.trim());
      setNewOrgName('');
      await refreshAdminData();
      setToast({ type: 'success', message: 'Organization created.' });
    } catch (error) {
      setToast({ type: 'error', message: `Create org failed: ${humanizeApiError(error)}` });
    } finally {
      setBusyAdminAction('');
    }
  }

  async function handleCreateProject(event: FormEvent) {
    event.preventDefault();
    if (!selectedOrgId || !newProjectName.trim()) return;

    setBusyAdminAction('create-project');
    try {
      const response = await createProject(
        normalizeApiBase(apiBase),
        token,
        selectedOrgId,
        newProjectName.trim(),
      );
      setNewProjectName('');
      await refreshAdminData();
      setActiveProjectId(response.project.id);
      setToast({ type: 'success', message: 'Project created.' });
    } catch (error) {
      setToast({ type: 'error', message: `Create project failed: ${humanizeApiError(error)}` });
    } finally {
      setBusyAdminAction('');
    }
  }

  async function handleCreateUserAndAddToOrg(event: FormEvent) {
    event.preventDefault();

    if (!selectedOrgId) {
      setToast({ type: 'error', message: 'Select an organization first.' });
      return;
    }

    const name = newUserName.trim();
    const email = newUserEmail.trim();
    const password = newUserPassword.trim();

    if (!name || !email || !password) {
      setToast({ type: 'error', message: 'Name, email, and password are required.' });
      return;
    }

    const normalizedApiBase = normalizeApiBase(apiBase);
    setBusyAdminAction('create-user');

    try {
      let userAlreadyExisted = false;

      try {
        await registerWithPassword(normalizedApiBase, name, email, password);
      } catch (error) {
        if (error instanceof ApiError && error.code === 'EMAIL_ALREADY_REGISTERED') {
          userAlreadyExisted = true;
        } else {
          throw error;
        }
      }

      await addOrgMember(normalizedApiBase, token, selectedOrgId, email, newUserOrgRole);

      if (createUserAlsoProject && activeProjectId) {
        await addProjectMember(
          normalizedApiBase,
          token,
          activeProjectId,
          email,
          newUserProjectRole,
        );
      }

      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserOrgRole('ORG_MEMBER');
      setNewUserProjectRole('PROJECT_MEMBER');

      await Promise.all([
        loadOrgMembers(selectedOrgId),
        activeProjectId ? loadProjectMembers(activeProjectId) : Promise.resolve(),
      ]);

      setToast({
        type: 'success',
        message: userAlreadyExisted
          ? 'User existed already. Memberships updated.'
          : 'User created and added successfully.',
      });
    } catch (error) {
      setToast({ type: 'error', message: `Create user failed: ${humanizeApiError(error)}` });
    } finally {
      setBusyAdminAction('');
    }
  }

  async function handleAddOrgMember(event: FormEvent) {
    event.preventDefault();
    if (!selectedOrgId || !orgInviteEmail.trim()) return;

    setBusyAdminAction('add-org-member');
    try {
      await addOrgMember(
        normalizeApiBase(apiBase),
        token,
        selectedOrgId,
        orgInviteEmail.trim(),
        orgInviteRole,
      );
      setOrgInviteEmail('');
      await loadOrgMembers(selectedOrgId);
      setToast({ type: 'success', message: 'Organization member added/updated.' });
    } catch (error) {
      setToast({ type: 'error', message: `Add org member failed: ${humanizeApiError(error)}` });
    } finally {
      setBusyAdminAction('');
    }
  }

  async function handleUpdateOrgMemberRole(userId: string, role: 'ORG_ADMIN' | 'ORG_MEMBER') {
    if (!selectedOrgId) return;

    setBusyAdminAction(`org-role-${userId}`);
    try {
      await updateOrgMemberRole(normalizeApiBase(apiBase), token, selectedOrgId, userId, role);
      await loadOrgMembers(selectedOrgId);
      setToast({ type: 'success', message: 'Organization role updated.' });
    } catch (error) {
      setToast({ type: 'error', message: `Update org role failed: ${humanizeApiError(error)}` });
    } finally {
      setBusyAdminAction('');
    }
  }

  async function handleAddProjectMember(event: FormEvent) {
    event.preventDefault();
    if (!activeProjectId || !projectInviteEmail.trim()) return;

    setBusyAdminAction('add-project-member');
    try {
      await addProjectMember(
        normalizeApiBase(apiBase),
        token,
        activeProjectId,
        projectInviteEmail.trim(),
        projectInviteRole,
      );
      setProjectInviteEmail('');
      await loadProjectMembers(activeProjectId);
      setToast({ type: 'success', message: 'Project member added/updated.' });
    } catch (error) {
      setToast({ type: 'error', message: `Add project member failed: ${humanizeApiError(error)}` });
    } finally {
      setBusyAdminAction('');
    }
  }

  async function handleUpdateProjectMemberRole(userId: string, role: ProjectRole) {
    if (!activeProjectId) return;

    setBusyAdminAction(`project-role-${userId}`);
    try {
      await updateProjectMemberRole(normalizeApiBase(apiBase), token, activeProjectId, userId, role);
      await loadProjectMembers(activeProjectId);
      setToast({ type: 'success', message: 'Project role updated.' });
    } catch (error) {
      setToast({ type: 'error', message: `Update project role failed: ${humanizeApiError(error)}` });
    } finally {
      setBusyAdminAction('');
    }
  }

  async function handleDrop(issueId: string, toStatus: IssueStatus) {
    const issue = issues.find((item) => item.id === issueId);
    if (!issue || issue.status === toStatus) {
      return;
    }

    setMovingIssueId(issueId);
    try {
      const response = await moveIssue(
        normalizeApiBase(apiBase),
        token,
        issueId,
        toStatus,
        issue.version,
      );

      setIssues((prev) =>
        prev.map((item) =>
          item.id === issueId
            ? {
                ...item,
                status: response.issue.status,
                version: response.issue.version,
                updatedAt: response.issue.updatedAt,
              }
            : item,
        ),
      );

      setToast({ type: 'success', message: 'Issue moved.' });

      if (issueDetail?.id === issueId) {
        setIssueDetail((prev) =>
          prev
            ? {
                ...prev,
                status: response.issue.status,
                version: response.issue.version,
                updatedAt: response.issue.updatedAt,
              }
            : prev,
        );
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VERSION_CONFLICT' && error.current) {
        setIssues((prev) =>
          prev.map((item) =>
            item.id === issueId
              ? {
                  ...item,
                  status: error.current?.status ?? item.status,
                  version: error.current?.version ?? item.version,
                  updatedAt: new Date().toISOString(),
                }
              : item,
          ),
        );
        setToast({ type: 'error', message: 'Issue changed by someone else. Board refreshed.' });
      } else {
        setToast({ type: 'error', message: `Move failed: ${humanizeApiError(error)}` });
      }
    } finally {
      setMovingIssueId('');
    }
  }

  async function openIssue(issueId: string, mode: IssuePanelMode = 'drawer') {
    setSelectedIssueId(issueId);
    setIssuePanelMode(mode);
    setLoadingIssueDetail(true);
    setLoadingIssueMessages(true);
    setLoadingIssueActivity(true);

    try {
      const baseUrl = normalizeApiBase(apiBase);
      const [issueResponse, messagesResponse, activityResponse] = await Promise.all([
        getIssue(baseUrl, token, issueId),
        listIssueMessages(baseUrl, token, issueId),
        listIssueActivity(baseUrl, token, issueId),
      ]);

      setIssueDetail(issueResponse.issue);
      setIssueDraft({
        title: issueResponse.issue.title,
        description: issueResponse.issue.description ?? '',
        priority: issueResponse.issue.priority,
        status: issueResponse.issue.status,
        assigneeId: issueResponse.issue.assigneeId ?? '',
      });
      setIssueMessages(messagesResponse.messages);
      setIssueActivity(activityResponse.activity);
    } catch (error) {
      setToast({ type: 'error', message: `Issue load failed: ${humanizeApiError(error)}` });
    } finally {
      setLoadingIssueDetail(false);
      setLoadingIssueMessages(false);
      setLoadingIssueActivity(false);
    }
  }

  function closeIssuePanel() {
    setSelectedIssueId('');
    setIssueDetail(null);
    setIssueDraft(null);
    setIssueMessages([]);
    setIssueActivity([]);
    setIssueMessageDraft('');
    setIssueTagMemberId('');
    setBusyIssueLifecycleAction('');
    setLoadingIssueDetail(false);
    setLoadingIssueMessages(false);
    setLoadingIssueActivity(false);
    setIssuePanelMode('drawer');
  }

  async function sendMessage() {
    if (!selectedIssueId) return;
    const content = issueMessageDraft.trim();
    if (!content) return;

    setSendingIssueMessage(true);
    try {
      const response = await sendIssueMessage(normalizeApiBase(apiBase), token, selectedIssueId, content);
      setIssueMessages((prev) => [...prev, response.message]);
      setIssueMessageDraft('');
      setIssueTagMemberId('');
    } catch (error) {
      setToast({ type: 'error', message: `Message failed: ${humanizeApiError(error)}` });
    } finally {
      setSendingIssueMessage(false);
    }
  }

  function insertIssueTag() {
    if (!issueTagMemberId) {
      return;
    }

    const member = projectParticipants.find((participant) => participant.userId === issueTagMemberId);
    if (!member) {
      return;
    }

    const rawHandle = member.name && member.name.trim().length > 0 ? member.name : member.email;
    const safeHandle = rawHandle.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_.@-]/g, '');
    const tag = `@${safeHandle}`;
    setIssueMessageDraft((prev) => {
      const prefix = prev.trim().length === 0 || prev.endsWith(' ') ? prev : `${prev} `;
      return `${prefix}${tag} `;
    });
  }

  async function copyIssueId(issueId: string) {
    try {
      await navigator.clipboard.writeText(issueId);
      setToast({ type: 'success', message: `Issue ID copied: ${issueId}` });
    } catch {
      setToast({ type: 'error', message: 'Could not copy Issue ID. Please copy manually.' });
    }
  }

  async function handleArchiveIssue(issueId: string) {
    if (!canArchiveOrDeleteIssue) {
      setToast({ type: 'error', message: 'Only ORG_OWNER or PROJECT_ADMIN can archive issues.' });
      return;
    }

    const actionKey = `archive-${issueId}`;
    setBusyIssueLifecycleAction(actionKey);

    try {
      await archiveIssueApi(normalizeApiBase(apiBase), token, issueId);

      setIssues((prev) => prev.filter((item) => item.id !== issueId));
      if (selectedIssueId === issueId) {
        closeIssuePanel();
      }

      if (activeProjectId) {
        void loadProjectNotifications(activeProjectId);
      }

      setToast({ type: 'success', message: 'Issue archived.' });
    } catch (error) {
      setToast({ type: 'error', message: `Archive failed: ${humanizeApiError(error)}` });
    } finally {
      setBusyIssueLifecycleAction('');
    }
  }

  async function handleDeleteIssue(issueId: string) {
    if (!canArchiveOrDeleteIssue) {
      setToast({ type: 'error', message: 'Only ORG_OWNER or PROJECT_ADMIN can delete issues.' });
      return;
    }

    const confirmed = window.confirm(
      'Delete this issue permanently? This cannot be undone.',
    );
    if (!confirmed) {
      return;
    }

    const actionKey = `delete-${issueId}`;
    setBusyIssueLifecycleAction(actionKey);

    try {
      await deleteIssueApi(normalizeApiBase(apiBase), token, issueId);

      setIssues((prev) => prev.filter((item) => item.id !== issueId));
      if (selectedIssueId === issueId) {
        closeIssuePanel();
      }

      if (activeProjectId) {
        void loadProjectNotifications(activeProjectId);
      }

      setToast({ type: 'success', message: 'Issue deleted.' });
    } catch (error) {
      setToast({ type: 'error', message: `Delete failed: ${humanizeApiError(error)}` });
    } finally {
      setBusyIssueLifecycleAction('');
    }
  }

  async function saveIssue() {
    if (!issueDetail || !issueDraft) return;

    const payload: UpdateIssuePayload = {};

    if (issueDraft.title.trim() !== issueDetail.title) {
      payload.title = issueDraft.title.trim();
    }

    const draftDescription = issueDraft.description.trim();
    const detailDescription = (issueDetail.description ?? '').trim();
    if (draftDescription !== detailDescription) {
      payload.description = draftDescription ? draftDescription : null;
    }

    if (issueDraft.priority !== issueDetail.priority) {
      payload.priority = issueDraft.priority;
    }

    if (issueDraft.status !== issueDetail.status) {
      payload.status = issueDraft.status;
    }

    const detailAssignee = issueDetail.assigneeId ?? '';
    if (issueDraft.assigneeId.trim() !== detailAssignee) {
      payload.assigneeId = issueDraft.assigneeId.trim() || null;
    }

    if (Object.keys(payload).length === 0) {
      setToast({ type: 'info', message: 'No changes to save.' });
      return;
    }

    payload.expectedVersion = issueDetail.version;
    setSavingIssue(true);

    try {
      const response = await patchIssue(normalizeApiBase(apiBase), token, issueDetail.id, payload);

      setIssueDetail(response.issue);
      setIssueDraft({
        title: response.issue.title,
        description: response.issue.description ?? '',
        priority: response.issue.priority,
        status: response.issue.status,
        assigneeId: response.issue.assigneeId ?? '',
      });

      setIssues((prev) =>
        prev.map((item) =>
          item.id === response.issue.id
            ? {
                ...item,
                title: response.issue.title,
                status: response.issue.status,
                priority: response.issue.priority,
                assigneeId: response.issue.assigneeId,
                assignee: response.issue.assignee,
                assignedAt: response.issue.assignedAt,
                version: response.issue.version,
                updatedAt: response.issue.updatedAt,
                thumbnailUrl: response.issue.thumbnailUrl,
              }
            : item,
        ),
      );

      if (activeProjectId) {
        void loadProjectNotifications(activeProjectId);
      }

      try {
        const activityResponse = await listIssueActivity(
          normalizeApiBase(apiBase),
          token,
          response.issue.id,
        );
        setIssueActivity(activityResponse.activity);
      } catch {
        // Keep existing timeline if reload fails.
      }

      setToast({ type: 'success', message: 'Issue updated.' });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') {
        setToast({ type: 'error', message: 'Issue was updated elsewhere. Reloading issue.' });
        await openIssue(issueDetail.id, issuePanelMode);
      } else {
        setToast({ type: 'error', message: `Issue update failed: ${humanizeApiError(error)}` });
      }
    } finally {
      setSavingIssue(false);
    }
  }

  const figmaLink = getIssueFigmaLink(issueDetail);
  const figmaEmbedUrl = getIssueFigmaEmbedUrl(issueDetail);

  const renderIssueDetailContent = (useFullEmbed: boolean) => {
    if (!issueDetail || !issueDraft) {
      return null;
    }

    const isArchivingIssue = busyIssueLifecycleAction === `archive-${issueDetail.id}`;
    const isDeletingIssue = busyIssueLifecycleAction === `delete-${issueDetail.id}`;
    const isLifecycleActionBusy = isArchivingIssue || isDeletingIssue;

    return (
      <div className={`issueBody ${useFullEmbed ? 'full' : ''}`}>
        <div className="issueMain">
          <div className="stackForm">
            <div>
              <label className="controlLabel">Issue ID</label>
              <div className="issueIdInline">
                <code>{issueDetail.id}</code>
                <button type="button" className="secondary tiny" onClick={() => void copyIssueId(issueDetail.id)}>
                  Copy
                </button>
              </div>
            </div>

            {useFullEmbed && canArchiveOrDeleteIssue ? (
              <div className="issueLifecycleActions">
                <button
                  type="button"
                  className="secondary tiny"
                  onClick={() => void handleArchiveIssue(issueDetail.id)}
                  disabled={savingIssue || isLifecycleActionBusy}
                >
                  {isArchivingIssue ? 'Archiving...' : 'Archive Ticket'}
                </button>
                <button
                  type="button"
                  className="danger tiny"
                  onClick={() => void handleDeleteIssue(issueDetail.id)}
                  disabled={savingIssue || isLifecycleActionBusy}
                >
                  {isDeletingIssue ? 'Deleting...' : 'Delete Ticket'}
                </button>
              </div>
            ) : null}

            <label className="controlLabel" htmlFor={useFullEmbed ? 'fullTitle' : 'drawerTitle'}>
              Title
            </label>
            <input
              id={useFullEmbed ? 'fullTitle' : 'drawerTitle'}
              value={issueDraft.title}
              onChange={(event) =>
                setIssueDraft((prev) => (prev ? { ...prev, title: event.target.value } : prev))
              }
            />

            <label className="controlLabel" htmlFor={useFullEmbed ? 'fullDescription' : 'drawerDescription'}>
              Description
            </label>
            <textarea
              id={useFullEmbed ? 'fullDescription' : 'drawerDescription'}
              value={issueDraft.description}
              onChange={(event) =>
                setIssueDraft((prev) => (prev ? { ...prev, description: event.target.value } : prev))
              }
            />

            <div className="split">
              <div>
                <label className="controlLabel" htmlFor={useFullEmbed ? 'fullPriority' : 'drawerPriority'}>
                  Priority
                </label>
                <select
                  id={useFullEmbed ? 'fullPriority' : 'drawerPriority'}
                  value={issueDraft.priority}
                  onChange={(event) =>
                    setIssueDraft((prev) =>
                      prev ? { ...prev, priority: event.target.value as IssuePriority } : prev,
                    )
                  }
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                </select>
              </div>
              <div>
                <label className="controlLabel" htmlFor={useFullEmbed ? 'fullStatus' : 'drawerStatus'}>
                  Status
                </label>
                <select
                  id={useFullEmbed ? 'fullStatus' : 'drawerStatus'}
                  value={issueDraft.status}
                  onChange={(event) =>
                    setIssueDraft((prev) =>
                      prev ? { ...prev, status: event.target.value as IssueStatus } : prev,
                    )
                  }
                >
                  <option value="TODO">TODO</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="REVIEW">REVIEW</option>
                  <option value="DONE">DONE</option>
                </select>
              </div>
            </div>

            <label className="controlLabel" htmlFor={useFullEmbed ? 'fullAssignee' : 'drawerAssignee'}>
              Assignee
            </label>
            <select
              id={useFullEmbed ? 'fullAssignee' : 'drawerAssignee'}
              value={issueDraft.assigneeId}
              onChange={(event) =>
                setIssueDraft((prev) => (prev ? { ...prev, assigneeId: event.target.value } : prev))
              }
            >
              <option value="">Unassigned</option>
              {assigneeOptions.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.label}
                </option>
              ))}
            </select>
          </div>

          <div className="figmaPanel">
            <h3>Related Figma</h3>
            {useFullEmbed && figmaEmbedUrl ? (
              <iframe
                src={figmaEmbedUrl}
                className="figmaEmbed"
                title={`Figma preview for ${issueDetail.title}`}
                loading="lazy"
                allow="fullscreen"
              />
            ) : issueDetail.thumbnailUrl ? (
              <img src={issueDetail.thumbnailUrl} alt={issueDetail.title} className="figmaPreview" />
            ) : (
              <div className="figmaPlaceholder">No Figma preview available</div>
            )}
            <div className="metaBlock compact">
              <span>File key: {issueDetail.figmaFileKey || 'n/a'}</span>
              <span>Node: {issueDetail.figmaNodeId || 'n/a'}</span>
              <span>Node name: {issueDetail.figmaNodeName || 'n/a'}</span>
            </div>
            <div className="buttonRow">
              <button
                className="secondary"
                onClick={() => figmaLink && window.open(figmaLink, '_blank', 'noopener,noreferrer')}
                disabled={!figmaLink}
              >
                Open in Figma
              </button>
            </div>
          </div>

          <div className="buttonRow stickySave">
            <button onClick={() => void saveIssue()} disabled={savingIssue}>
              {savingIssue ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        <section className="issueMetaColumn">
          <section className="issueChatPanel">
            <h3>Issue Chat</h3>
            <div className="chatList">
              {loadingIssueMessages ? <p className="muted">Loading chat...</p> : null}
              {!loadingIssueMessages && issueMessages.length === 0 ? (
                <p className="muted">No messages yet.</p>
              ) : null}
              {issueMessages.map((message) => {
                const displayName = message.sender.name || message.sender.email;
                const isMine = message.sender.id === user?.id;
                return (
                  <article key={message.id} className={`chatBubble ${isMine ? 'mine' : ''}`}>
                    <header>
                      <strong>{displayName}</strong>
                      <span>{new Date(message.createdAt).toLocaleString()}</span>
                    </header>
                    <p>{renderTaggedMessage(message.content)}</p>
                  </article>
                );
              })}
            </div>
            <form
              className="chatComposer"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                void sendMessage();
              }}
            >
              <div className="chatTagRow">
                <select
                  value={issueTagMemberId}
                  onChange={(event) => setIssueTagMemberId(event.target.value)}
                  disabled={!canSendIssueMessages}
                >
                  <option value="">Tag project member…</option>
                  {projectParticipants.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name || member.email}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="secondary tiny"
                  onClick={insertIssueTag}
                  disabled={!issueTagMemberId || !canSendIssueMessages}
                >
                  Insert Tag
                </button>
              </div>
              <textarea
                value={issueMessageDraft}
                onChange={(event) => setIssueMessageDraft(event.target.value)}
                placeholder={canSendIssueMessages ? 'Write a message...' : 'Viewer role is read-only'}
                disabled={!canSendIssueMessages || sendingIssueMessage}
                rows={3}
              />
              <button
                type="submit"
                disabled={
                  !canSendIssueMessages ||
                  sendingIssueMessage ||
                  issueMessageDraft.trim().length === 0
                }
              >
                {sendingIssueMessage ? 'Sending...' : 'Send'}
              </button>
            </form>
          </section>

          <section className="issueTimelinePanel">
            <h3>Activity Timeline</h3>
            <div className="timelineList">
              {loadingIssueActivity ? <p className="muted">Loading timeline...</p> : null}
              {!loadingIssueActivity && issueActivity.length === 0 ? (
                <p className="muted">No timeline entries yet.</p>
              ) : null}
              {issueActivity.map((entry) => (
                <article key={entry.id} className="timelineItem">
                  <header>
                    <strong>{entry.summary}</strong>
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                  </header>
                  <p>{activityActorLabel(entry)}</p>
                </article>
              ))}
            </div>
          </section>
        </section>
      </div>
    );
  };

  const renderThemeSwitcher = (extraClass?: string) => (
    <div className={`themeIcons ${extraClass ?? ''}`.trim()} role="group" aria-label="Theme switcher">
      <button
        type="button"
        className={`iconThemeBtn ${themeMode === 'light' ? 'active' : ''}`}
        aria-label="Light theme"
        title="Light"
        onClick={() => setThemeMode('light')}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1zm0 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7-4a1 1 0 0 1 0 2h-1a1 1 0 1 1 0-2zm-12 1a1 1 0 0 1-1 1H5a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1zm8.95-6.536a1 1 0 0 1 1.414 0l.707.707a1 1 0 0 1-1.414 1.415l-.707-.708a1 1 0 0 1 0-1.414zm-9.193 9.193a1 1 0 0 1 1.414 0l.708.707a1 1 0 1 1-1.415 1.414l-.707-.707a1 1 0 0 1 0-1.414zm10.607 1.414a1 1 0 0 1-1.414 0l-.707-.707a1 1 0 1 1 1.414-1.415l.707.708a1 1 0 0 1 0 1.414zM8.172 8.879a1 1 0 0 1-1.414 0l-.708-.707A1 1 0 1 1 7.465 6.758l.707.707a1 1 0 0 1 0 1.414z" />
        </svg>
      </button>

      <button
        type="button"
        className={`iconThemeBtn ${themeMode === 'dark' ? 'active' : ''}`}
        aria-label="Dark theme"
        title="Dark"
        onClick={() => setThemeMode('dark')}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.5 3a1 1 0 0 1 .913 1.408A8 8 0 1 0 19.592 15.5a1 1 0 0 1 1.408.913A10 10 0 1 1 13.087 3.087 1 1 0 0 1 14.5 3z" />
        </svg>
      </button>

      <button
        type="button"
        className={`iconThemeBtn ${themeMode === 'system' ? 'active' : ''}`}
        aria-label="System theme"
        title="System"
        onClick={() => setThemeMode('system')}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h5l-1 2H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-1l-1-2h5a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 2h14v9H5zm6.5 11h1l1 2h-3z" />
        </svg>
      </button>
    </div>
  );

  const renderFiduxLogo = (extraClass?: string) => (
    <div className={`fiduxLogo ${extraClass ?? ''}`.trim()} aria-label="Fidux logo">
      <span className="fiduxLogoIcon" aria-hidden="true">
        <span className="fiduxBlock b1" />
        <span className="fiduxBlock b2" />
        <span className="fiduxBlock b3" />
        <span className="fiduxBlock b4" />
      </span>
      <span className="fiduxLogoWordmark">fidux</span>
    </div>
  );

  return (
    <div className={`appRoot ${token ? 'sessionRoot' : 'authRoot'}`}>
      {token ? (
        <header className="topBar">
          <div className="brandWrap">
            {renderFiduxLogo('headerLogo')}
            <p className="brandTagline">DesignFlow board for issues, teams, and Figma context.</p>
          </div>
          <div className="topActions">
            <div className="desktopTabs">
              <div className="mainTabs" role="tablist" aria-label="Main tabs">
                <button
                  type="button"
                  role="tab"
                  className={`mainTab ${mainTab === 'dashboard' ? 'active' : ''}`}
                  aria-selected={mainTab === 'dashboard'}
                  onClick={() => selectMainTab('dashboard')}
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`mainTab ${mainTab === 'admin' ? 'active' : ''}`}
                  aria-selected={mainTab === 'admin'}
                  onClick={() => selectMainTab('admin')}
                >
                  Admin
                </button>
                {renderNotificationButton()}
                <button
                  type="button"
                  role="tab"
                  className={`mainTab ${mainTab === 'profile' ? 'active' : ''}`}
                  aria-selected={mainTab === 'profile'}
                  onClick={() => selectMainTab('profile')}
                >
                  Profile
                </button>

                <button type="button" className="mainTab" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            </div>
            <div className="mobileNavRow">
              {renderNotificationButton('mobileNotificationButton')}
              <div className="mobileMenuWrap">
                <button
                  type="button"
                  className={`mobileMenuToggle ${mobileNavOpen ? 'open' : ''}`}
                  aria-expanded={mobileNavOpen}
                  aria-haspopup="menu"
                  aria-label="Open navigation menu"
                  onClick={() => setMobileNavOpen((current) => !current)}
                >
                  <span className="mobileMenuLines" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  <span>Menu</span>
                </button>
                {mobileNavOpen ? (
                  <div className="mobileMenuDropdown panel" role="menu" aria-label="Mobile navigation">
                    <button
                      type="button"
                      role="menuitem"
                      className={`mobileMenuItem ${mainTab === 'dashboard' ? 'active' : ''}`}
                      onClick={() => selectMainTab('dashboard')}
                    >
                      Dashboard
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={`mobileMenuItem ${mainTab === 'admin' ? 'active' : ''}`}
                      onClick={() => selectMainTab('admin')}
                    >
                      Admin
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={`mobileMenuItem ${mainTab === 'profile' ? 'active' : ''}`}
                      onClick={() => selectMainTab('profile')}
                    >
                      Profile
                    </button>
                    <button type="button" role="menuitem" className="mobileMenuItem" onClick={handleLogout}>
                      Logout
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            {renderThemeSwitcher()}
          </div>
        </header>
      ) : (
        <div className="authTopTools">
          {renderThemeSwitcher('authThemeIcons')}
        </div>
      )}

      {!token ? (
        <main className="authLayout">
          <section className="panel authHeroPanel" aria-hidden="true">
            {renderFiduxLogo('authHeroLogo')}
            <div className="authHeroCopy">
              <h2>Streamline Your Workflow</h2>
              <p className="authHeroLead">Efficient Task Management &amp; Team Collaboration.</p>
              <p className="authHeroSub">Organize, track, and optimize your projects with a fast Kanban workflow.</p>
            </div>

            <div className="authMiniBoard">
              <article className="authMiniColumn">
                <h3>To Do</h3>
                <div className="authMiniCard">
                  <span />
                  <span />
                </div>
                <div className="authMiniCard">
                  <span />
                  <span />
                </div>
              </article>
              <article className="authMiniColumn">
                <h3>In Progress</h3>
                <div className="authMiniCard">
                  <span />
                  <span />
                </div>
                <div className="authMiniCard">
                  <span />
                  <span />
                </div>
              </article>
              <article className="authMiniColumn">
                <h3>Done</h3>
                <div className="authMiniCard">
                  <span />
                  <span />
                </div>
              </article>
            </div>

            <div className="authHeroBadges">
              <span><i>T</i>Track Tasks</span>
              <span><i>C</i>Collaborate</span>
              <span><i>P</i>Boost Productivity</span>
            </div>
          </section>

          <section className="panel authPanel authFormPanel">
            <div className="authPanelHeader">
              {authMode === 'login' ? (
                <h2>Login <span>to Your Account</span></h2>
              ) : null}
              {authMode === 'signup' ? (
                <h2>Create <span>Your Account</span></h2>
              ) : null}
              {authMode === 'token' ? (
                <h2>Use <span>Access Token</span></h2>
              ) : null}
            </div>

            <div className="authTabs">
              <button type="button" className={`authTab ${authMode === 'login' ? 'active' : ''}`} onClick={() => setAuthMode('login')}>Login</button>
              <button type="button" className={`authTab ${authMode === 'signup' ? 'active' : ''}`} onClick={() => setAuthMode('signup')}>Sign Up</button>
              <button type="button" className={`authTab ${authMode === 'token' ? 'active' : ''}`} onClick={() => setAuthMode('token')}>Use Token</button>
            </div>

            {authMode === 'login' ? (
              <form onSubmit={handleLogin} className="stackForm authForm">
                <label className="controlLabel" htmlFor="loginEmail">Email</label>
                <div className="authInputShell">
                  <span className="authInputIcon" aria-hidden="true">@</span>
                  <input
                    id="loginEmail"
                    type="email"
                    value={loginEmail}
                    onChange={(event) => setLoginEmail(event.target.value)}
                    placeholder="Enter your email"
                    required
                  />
                </div>

                <label className="controlLabel" htmlFor="loginPassword">Password</label>
                <div className="authInputShell">
                  <span className="authInputIcon" aria-hidden="true">*</span>
                  <input
                    id="loginPassword"
                    type="password"
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                    placeholder="Enter your password"
                    required
                  />
                </div>

                <label className="controlLabel" htmlFor="apiBase">API Base</label>
                <input
                  id="apiBase"
                  value={apiBase}
                  onChange={(event) => setApiBase(event.target.value)}
                  placeholder="/api or https://api.example.com/api"
                />
                <p className="helperText">Advanced override. Leave as <strong>/api</strong> when the app and API share one domain.</p>

                <button type="submit" className="authSubmitButton" disabled={loadingSession}>
                  {loadingSession ? 'Logging In...' : 'Login'}
                </button>
              </form>
            ) : null}

            {authMode === 'signup' ? (
              <form onSubmit={handleSignup} className="stackForm authForm">
                <label className="controlLabel" htmlFor="signupName">Name</label>
                <div className="authInputShell">
                  <span className="authInputIcon" aria-hidden="true">U</span>
                  <input
                    id="signupName"
                    value={signupName}
                    onChange={(event) => setSignupName(event.target.value)}
                    placeholder="Enter your full name"
                    required
                  />
                </div>

                <label className="controlLabel" htmlFor="signupEmail">Email</label>
                <div className="authInputShell">
                  <span className="authInputIcon" aria-hidden="true">@</span>
                  <input
                    id="signupEmail"
                    type="email"
                    value={signupEmail}
                    onChange={(event) => setSignupEmail(event.target.value)}
                    placeholder="Enter your email"
                    required
                  />
                </div>

                <label className="controlLabel" htmlFor="signupPassword">Password</label>
                <div className="authInputShell">
                  <span className="authInputIcon" aria-hidden="true">*</span>
                  <input
                    id="signupPassword"
                    type="password"
                    value={signupPassword}
                    onChange={(event) => setSignupPassword(event.target.value)}
                    placeholder="Create a password"
                    required
                  />
                </div>

                <label className="controlLabel" htmlFor="apiBaseSignup">API Base</label>
                <input
                  id="apiBaseSignup"
                  value={apiBase}
                  onChange={(event) => setApiBase(event.target.value)}
                  placeholder="/api or https://api.example.com/api"
                />
                <p className="helperText">Advanced override. Leave as <strong>/api</strong> when the app and API share one domain.</p>

                <button type="submit" className="authSubmitButton" disabled={loadingSession}>
                  {loadingSession ? 'Creating Account...' : 'Create Account'}
                </button>
              </form>
            ) : null}

            {authMode === 'token' ? (
              <form onSubmit={handleUseToken} className="stackForm authForm">
                <label className="controlLabel" htmlFor="tokenInput">Access Token</label>
                <div className="authInputShell tokenShell">
                  <span className="authInputIcon" aria-hidden="true">K</span>
                  <textarea
                    id="tokenInput"
                    value={tokenInput}
                    onChange={(event) => setTokenInput(event.target.value)}
                    placeholder="eyJhbGci..."
                  />
                </div>

                <label className="controlLabel" htmlFor="apiBaseToken">API Base</label>
                <input
                  id="apiBaseToken"
                  value={apiBase}
                  onChange={(event) => setApiBase(event.target.value)}
                  placeholder="/api or https://api.example.com/api"
                />
                <p className="helperText">Advanced override. Leave as <strong>/api</strong> when the app and API share one domain.</p>

                <button type="submit" className="authSubmitButton" disabled={loadingSession}>
                  {loadingSession ? 'Applying Token...' : 'Continue with Token'}
                </button>
              </form>
            ) : null}

            <div className="authFooterLine">
              {authMode === 'login' ? (
                <p>
                  Don&apos;t have an account?{' '}
                  <button type="button" className="authInlineLink" onClick={() => setAuthMode('signup')}>
                    Sign Up
                  </button>
                </p>
              ) : null}
              {authMode === 'signup' ? (
                <p>
                  Already have an account?{' '}
                  <button type="button" className="authInlineLink" onClick={() => setAuthMode('login')}>
                    Login
                  </button>
                </p>
              ) : null}
              {authMode === 'token' ? (
                <p>
                  Need email login?{' '}
                  <button type="button" className="authInlineLink" onClick={() => setAuthMode('login')}>
                    Switch to Login
                  </button>
                </p>
              ) : null}
            </div>
          </section>
        </main>
      ) : (
        <main className="appLayout">
          <section className="panel workspaceBar">
            <article className="workspaceCard workspaceProfileCard">
              <div className="workspaceCardHeader">
                <span className="sectionEyebrow">Workspace</span>
                <span className="workspaceStatus">{activeProject ? 'Project live' : 'Waiting for selection'}</span>
              </div>
              <div className="workspaceIdentity">
                <div className="metaBlock userBlock">
                  <strong className="profileName">{user?.name || 'User'}</strong>
                  <span className="profileEmail">{user?.email}</span>
                </div>
                <div className="workspaceSummary">
                  <h2>{activeProject?.name || 'Choose a project'}</h2>
                  <p>
                    {selectedOrg
                      ? `${selectedOrg.name} workspace with Figma-linked issue tracking, delivery flow, and team collaboration.`
                      : 'Select an organization and project to load the current delivery workspace.'}
                  </p>
                </div>
              </div>
              <div className="workspaceMetaGrid">
                <span className="workspaceMetaPill">
                  <strong>Org role</strong>
                  <em>{selectedOrg?.role || 'N/A'}</em>
                </span>
                <span className="workspaceMetaPill">
                  <strong>Project role</strong>
                  <em>{activeProject?.role || 'N/A'}</em>
                </span>
              </div>
            </article>

            <article className="workspaceCard workspaceControlCard">
              <div className="workspaceCardHeader">
                <span className="sectionEyebrow">Organization</span>
              </div>
              <div className="workspaceField">
                <label className="controlLabel" htmlFor="orgSelect">Select organization</label>
                <select id="orgSelect" value={selectedOrgId} onChange={(event) => setSelectedOrgId(event.target.value)}>
                  {organizations.length === 0 ? <option value="">No orgs</option> : null}
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>{org.name} ({org.role})</option>
                  ))}
                </select>
              </div>
            </article>

            <article className="workspaceCard workspaceControlCard">
              <div className="workspaceCardHeader">
                <span className="sectionEyebrow">Project</span>
              </div>
              <div className="workspaceField">
                <label className="controlLabel" htmlFor="projectSelect">Select project</label>
                <select
                  id="projectSelect"
                  value={activeProjectId}
                  onChange={(event) => {
                    const nextProjectId = event.target.value;
                    setActiveProjectId(nextProjectId);
                    const project = projects.find((item) => item.id === nextProjectId);
                    if (project?.orgId) {
                      setSelectedOrgId(project.orgId);
                    }
                  }}
                  disabled={loadingSession || projects.length === 0}
                >
                  {projects.length === 0 ? <option value="">No projects</option> : null}
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name} ({project.role})</option>
                  ))}
                </select>
              </div>
            </article>

            <article className="workspaceMetricCard">
              <span className="metricLabel">Total Issues</span>
              <strong>{boardMetrics.total}</strong>
              <p>Across the selected project board.</p>
            </article>

            <article className="workspaceMetricCard">
              <span className="metricLabel">Active Work</span>
              <strong>{boardMetrics.active}</strong>
              <p>Issues still moving through delivery.</p>
            </article>

            <article className="workspaceMetricCard">
              <span className="metricLabel">Alerts</span>
              <strong>{notifications.length}</strong>
              <p>Unread assignment notifications.</p>
            </article>
          </section>

          {mainTab === 'dashboard' ? (
            <section className="boardArea">
              {issuePanelMode === 'full' && selectedIssueId ? (
                <>
                  <div className="boardHeader">
                    <div className="boardHeaderTop">
                      <div>
                        <span className="sectionEyebrow">Focused Issue Workspace</span>
                        <h2>Issue Workspace</h2>
                      </div>
                      <div className="buttonRow fullHeaderActions">
                        <button
                          type="button"
                          className="tiny refreshBoardButton"
                          onClick={() => activeProjectId && void loadIssues(activeProjectId)}
                          disabled={!activeProjectId || loadingIssues}
                        >
                          {loadingIssues ? 'Refreshing...' : 'Refresh Board'}
                        </button>
                        <button
                          type="button"
                          className="secondary tiny"
                          onClick={() => setIssuePanelMode('drawer')}
                        >
                          Dock Right
                        </button>
                        <button type="button" className="secondary tiny" onClick={closeIssuePanel}>
                          Close
                        </button>
                      </div>
                    </div>
                    <p className="muted">
                      Full-page issue editing with left issue rail, complete activity timeline, chat,
                      and embedded Figma preview.
                    </p>
                    <div className="boardStats">
                      <span className="boardStatChip">Project: {activeProject?.name || 'N/A'}</span>
                      <span className="boardStatChip">Open issues: {boardMetrics.active}</span>
                      <span className="boardStatChip">High priority: {boardMetrics.highPriority}</span>
                    </div>
                  </div>

                  <div className="fullIssuePage">
                    <aside className="panel fullIssueRail">
                      <div className="fullIssueRailHeader">
                        <h3>Project Issues</h3>
                        <span>{fullIssueRail.length}</span>
                      </div>
                      <div className="fullIssueRailList">
                        {fullIssueRail.map((issue) => (
                          <article
                            key={issue.id}
                            className={`fullIssueRailCard ${selectedIssueId === issue.id ? 'active' : ''}`}
                            onClick={() => void openIssue(issue.id, 'full')}
                          >
                            {issue.thumbnailUrl ? (
                              <img src={issue.thumbnailUrl} alt={issue.title} className="fullIssueRailThumb" />
                            ) : null}
                            <div className="fullIssueRailBody">
                              <strong>{issue.title}</strong>
                              <span className="issueIdPill" title={issue.id}>
                                #{shortId(issue.id, 20)}
                              </span>
                              <span className={`priority ${issue.priority.toLowerCase()}`}>
                                {issue.priority}
                              </span>
                            </div>
                          </article>
                        ))}
                      </div>
                    </aside>

                    <section className="panel fullIssueContent">
                      <div className="fullIssueContentHeader">
                        <div>
                          <h3>{issueDetail?.title || 'Issue details'}</h3>
                          {issueDetail ? (
                            <p className="muted">
                              ID: <code>{issueDetail.id}</code>
                            </p>
                          ) : (
                            <p className="muted">Loading issue details…</p>
                          )}
                        </div>
                      </div>
                      {loadingIssueDetail ? <p className="muted">Loading issue…</p> : null}
                      {!loadingIssueDetail && issueDetail && issueDraft
                        ? renderIssueDetailContent(true)
                        : null}
                    </section>
                  </div>
                </>
              ) : (
                <>
                  <div className="boardHeader">
                    <div className="boardHeaderTop">
                      <div>
                        <span className="sectionEyebrow">Delivery Board</span>
                        <h2>Kanban Board</h2>
                      </div>
                      <button
                        type="button"
                        className="tiny refreshBoardButton"
                        onClick={() => activeProjectId && void loadIssues(activeProjectId)}
                        disabled={!activeProjectId || loadingIssues}
                      >
                        {loadingIssues ? 'Refreshing...' : 'Refresh Board'}
                      </button>
                    </div>
                    <p className="muted">
                      {activeProject ? `${activeProject.name} (${activeProject.role})` : 'Select a project.'}{' '}
                      Click a card for details, drag to move, or use <strong>Open Full</strong> for
                      focused issue editing with Figma links.
                    </p>
                    <div className="boardStats">
                      <span className="boardStatChip">Total: {boardMetrics.total}</span>
                      <span className="boardStatChip">Done: {boardMetrics.done}</span>
                      <span className="boardStatChip">Unassigned: {boardMetrics.unassigned}</span>
                      <span className="boardStatChip">Notifications: {notifications.length}</span>
                    </div>
                  </div>

                  {loadingIssues ? <div className="panel loadingState">Loading issues...</div> : null}
                  {!loadingIssues && activeProjectId && issues.length === 0 ? (
                    <div className="panel emptyState">No issues in this project yet.</div>
                  ) : null}

                  {!loadingIssues && issues.length > 0 ? (
                    <div className="boardGrid">
                      {STATUS_META.map((column) => (
                        <div
                          key={column.key}
                          className={`column ${column.className}`}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault();
                            const issueId =
                              event.dataTransfer.getData('text/issue-id') ||
                              event.dataTransfer.getData('text/plain');
                            if (issueId) {
                              void handleDrop(issueId, column.key);
                            }
                          }}
                        >
                          <div className="columnHeader">
                            <h3>{column.label}</h3>
                            <span>{groupedIssues[column.key].length}</span>
                          </div>

                          <div className="cardList">
                            {groupedIssues[column.key].map((issue) => (
                              <article
                                key={issue.id}
                                className={`issueCard ${movingIssueId === issue.id ? 'moving' : ''}`}
                                draggable={movingIssueId !== issue.id}
                                onDragStart={(event) => {
                                  event.dataTransfer.setData('text/issue-id', issue.id);
                                  event.dataTransfer.setData('text/plain', issue.id);
                                }}
                                onClick={() => void openIssue(issue.id, 'drawer')}
                              >
                                {issue.thumbnailUrl ? (
                                  <img src={issue.thumbnailUrl} alt={issue.title} className="issueThumb" />
                                ) : null}
                                <div className="issueTitle">{issue.title}</div>
                                <div className="issueIdRow">
                                  <span className="issueIdPill" title={issue.id}>
                                    #{shortId(issue.id, 20)}
                                  </span>
                                </div>
                                <div className="issueMeta">
                                  <span className={`priority ${issue.priority.toLowerCase()}`}>
                                    {issue.priority}
                                  </span>
                                  <span>v{issue.version}</span>
                                </div>
                                <div className="assigneeMeta">
                                  <span className="assigneeName">
                                    {resolveAssigneeName(issue.assigneeId, issue.assignee)}
                                  </span>
                                  <span className="assigneeAge">{formatAssignedAge(issue.assignedAt)}</span>
                                </div>
                                <div className="cardActions">
                                  <button
                                    type="button"
                                    className="secondary tiny"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void openIssue(issue.id, 'full');
                                    }}
                                  >
                                    Open Full
                                  </button>
                                </div>
                              </article>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </section>
          ) : mainTab === 'admin' ? (
            <section className="boardArea">
              <div className="boardHeader">
                <span className="sectionEyebrow">Operations</span>
                <h2>Admin Console</h2>
                <p className="muted">
                  As org leader/admin, create orgs/projects, onboard users, and assign org/project roles.
                </p>
              </div>

              <div className="panel adminShell">
                <section className="adminSection">
                  <h3>Organization Management</h3>
                  <p className="helperText">
                    Current org role: <strong>{selectedOrg?.role || 'N/A'}</strong>. Org owner/admin can add members.
                  </p>

                  <form className="stackForm" onSubmit={handleCreateOrganization}>
                    <label className="controlLabel" htmlFor="newOrgName">Create Organization</label>
                    <input id="newOrgName" value={newOrgName} onChange={(event) => setNewOrgName(event.target.value)} placeholder="Fidux Studio" />
                    <button type="submit" disabled={busyAdminAction === 'create-org'}>Create Org</button>
                  </form>

                  <form className="stackForm" onSubmit={handleCreateProject}>
                    <label className="controlLabel" htmlFor="newProjectName">Create Project</label>
                    <input id="newProjectName" value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Web App" />
                    <button type="submit" disabled={!selectedOrgId || !canManageOrg || busyAdminAction === 'create-project'}>Create Project</button>
                  </form>
                  {!canManageOrg ? <p className="helperText">Project creation requires ORG_ADMIN or ORG_OWNER.</p> : null}

                  <form className="stackForm" onSubmit={handleCreateUserAndAddToOrg}>
                    <label className="controlLabel" htmlFor="newUserName">Create User + Add Membership</label>
                    <input id="newUserName" value={newUserName} onChange={(event) => setNewUserName(event.target.value)} placeholder="Member name" />
                    <input type="email" value={newUserEmail} onChange={(event) => setNewUserEmail(event.target.value)} placeholder="member@example.com" />
                    <input type="password" value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} placeholder="Temporary password" />
                    <select value={newUserOrgRole} onChange={(event) => setNewUserOrgRole(event.target.value as 'ORG_ADMIN' | 'ORG_MEMBER')}>
                      {ORG_ASSIGNABLE_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>

                    <label className="checkboxRow">
                      <input
                        type="checkbox"
                        checked={createUserAlsoProject}
                        onChange={(event) => setCreateUserAlsoProject(event.target.checked)}
                        disabled={!activeProjectId}
                      />
                      <span>Also add to selected project</span>
                    </label>

                    {createUserAlsoProject ? (
                      <select value={newUserProjectRole} onChange={(event) => setNewUserProjectRole(event.target.value as ProjectRole)}>
                        {PROJECT_ASSIGNABLE_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                      </select>
                    ) : null}

                    <button type="submit" disabled={!canInviteOrgMembers || busyAdminAction === 'create-user'}>
                      {busyAdminAction === 'create-user' ? 'Creating User...' : 'Create User & Add'}
                    </button>
                  </form>

                  <form className="stackForm" onSubmit={handleAddOrgMember}>
                    <label className="controlLabel" htmlFor="orgInviteEmail">Add Existing User To Org</label>
                    <input id="orgInviteEmail" type="email" value={orgInviteEmail} onChange={(event) => setOrgInviteEmail(event.target.value)} placeholder="member@example.com" />
                    <select value={orgInviteRole} onChange={(event) => setOrgInviteRole(event.target.value as 'ORG_ADMIN' | 'ORG_MEMBER')}>
                      {ORG_ASSIGNABLE_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                    <button type="submit" disabled={!canInviteOrgMembers || busyAdminAction === 'add-org-member'}>Add To Org</button>
                  </form>
                </section>

                <section className="adminSection">
                  <h3>Role Assignment</h3>
                  <form className="stackForm" onSubmit={handleAddProjectMember}>
                    <label className="controlLabel" htmlFor="projectInviteEmail">Add User To Project</label>
                    <input id="projectInviteEmail" type="email" value={projectInviteEmail} onChange={(event) => setProjectInviteEmail(event.target.value)} placeholder="member@example.com" />
                    <select value={projectInviteRole} onChange={(event) => setProjectInviteRole(event.target.value as ProjectRole)}>
                      {PROJECT_ASSIGNABLE_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                    <button type="submit" disabled={!canInviteProjectMembers || busyAdminAction === 'add-project-member'}>Add To Project</button>
                  </form>

                  <div className="listPanel">
                    <div className="listHeader">
                      <strong>Org Members</strong>
                      <button type="button" className="secondary tiny" onClick={() => selectedOrgId && void loadOrgMembers(selectedOrgId)} disabled={!selectedOrgId || loadingMembers}>Reload</button>
                    </div>
                    <div className="memberList">
                      {orgMembers.map((member) => (
                        <div key={`org-${member.userId}`} className="memberRow">
                          <div>
                            <div className="memberName">{member.name || member.email}</div>
                            <div className="memberMeta">{member.email}</div>
                          </div>
                          <select
                            value={member.role === 'ORG_OWNER' ? 'ORG_ADMIN' : member.role}
                            disabled={!canChangeOrgRoles || member.role === 'ORG_OWNER' || busyAdminAction === `org-role-${member.userId}`}
                            onChange={(event) => void handleUpdateOrgMemberRole(member.userId, event.target.value as 'ORG_ADMIN' | 'ORG_MEMBER')}
                          >
                            {ORG_ASSIGNABLE_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="listPanel">
                    <div className="listHeader">
                      <strong>Project Members</strong>
                      <button type="button" className="secondary tiny" onClick={() => activeProjectId && void loadProjectMembers(activeProjectId)} disabled={!activeProjectId}>Reload</button>
                    </div>
                    <div className="memberList">
                      {projectMembers.map((member) => (
                        <div key={`project-${member.userId}`} className="memberRow">
                          <div>
                            <div className="memberName">{member.name || member.email}</div>
                            <div className="memberMeta">{member.email}</div>
                          </div>
                          <select
                            value={member.role}
                            disabled={!canManageProject || busyAdminAction === `project-role-${member.userId}`}
                            onChange={(event) => void handleUpdateProjectMemberRole(member.userId, event.target.value as ProjectRole)}
                          >
                            {PROJECT_ASSIGNABLE_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            </section>
          ) : mainTab === 'notifications' ? (
            <section className="boardArea">
              <div className="boardHeader">
                <div className="boardHeaderTop">
                  <div>
                    <span className="sectionEyebrow">Inbox</span>
                    <h2>Notifications</h2>
                  </div>
                  <button
                    type="button"
                    className="tiny refreshBoardButton"
                    onClick={() => activeProjectId && void loadProjectNotifications(activeProjectId)}
                    disabled={!activeProjectId || loadingNotifications}
                  >
                    {loadingNotifications ? 'Refreshing...' : 'Refresh Notifications'}
                  </button>
                </div>
                <p className="muted">Assignment notifications for the selected project.</p>
              </div>

              <div className="panel adminShell">
                {loadingNotifications ? <p className="muted">Loading notifications...</p> : null}
                {!loadingNotifications && notifications.length === 0 ? (
                  <p className="muted">No notifications yet.</p>
                ) : null}
                {!loadingNotifications ? (
                  <div className="memberList">
                    {notifications.map((notification) => (
                      <article key={notification.id} className="memberRow">
                        <div>
                          <div className="memberName">{notification.message}</div>
                          <div className="memberMeta">
                            {new Date(notification.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="secondary tiny"
                          onClick={() => void openIssue(notification.issue.id, 'drawer')}
                        >
                          Open Issue
                        </button>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          ) : (
            <section className="boardArea">
              <div className="boardHeader">
                <span className="sectionEyebrow">Account</span>
                <h2>Profile</h2>
                <p className="muted">Account details and security settings.</p>
              </div>

              <div className="panel adminShell">
                <section className="adminSection">
                  <h3>Account</h3>
                  <div className="metaBlock">
                    <span><strong>Name:</strong> {user?.name || 'N/A'}</span>
                    <span><strong>Email:</strong> {user?.email || 'N/A'}</span>
                    <span><strong>Email verified:</strong> {user?.emailVerified ? 'Yes' : 'No'}</span>
                  </div>

                  {!user?.emailVerified ? (
                    <button
                      type="button"
                      onClick={() => void handleResendVerificationEmail()}
                      disabled={busySecurityAction === 'resend-verification'}
                    >
                      {busySecurityAction === 'resend-verification'
                        ? 'Sending...'
                        : 'Resend Verification Email'}
                    </button>
                  ) : null}
                </section>

                <section className="adminSection">
                  <h3>Security</h3>
                  <form className="stackForm" onSubmit={handleChangePassword}>
                    <label className="controlLabel" htmlFor="currentPasswordInput">Current Password</label>
                    <input
                      id="currentPasswordInput"
                      type="password"
                      value={currentPasswordInput}
                      onChange={(event) => setCurrentPasswordInput(event.target.value)}
                      required
                    />

                    <label className="controlLabel" htmlFor="newPasswordInput">New Password</label>
                    <input
                      id="newPasswordInput"
                      type="password"
                      value={newPasswordInput}
                      onChange={(event) => setNewPasswordInput(event.target.value)}
                      required
                    />

                    <label className="controlLabel" htmlFor="confirmPasswordInput">Confirm New Password</label>
                    <input
                      id="confirmPasswordInput"
                      type="password"
                      value={confirmPasswordInput}
                      onChange={(event) => setConfirmPasswordInput(event.target.value)}
                      required
                    />

                    <button type="submit" disabled={busySecurityAction === 'change-password'}>
                      {busySecurityAction === 'change-password' ? 'Updating...' : 'Change Password'}
                    </button>
                  </form>
                </section>
              </div>
            </section>
          )}
        </main>
      )}

      {issuePanelMode === 'drawer' ? (
        <aside className={`issuePanel ${selectedIssueId ? 'open' : ''}`}>
          <div className="drawerHeader">
            <h2>Issue Details</h2>
            <div className="drawerActions">
              {selectedIssueId ? (
                <button
                  className="secondary"
                  onClick={() => selectedIssueId && void openIssue(selectedIssueId, 'full')}
                >
                  Open Full
                </button>
              ) : null}
              <button className="iconButton" onClick={closeIssuePanel}>
                ×
              </button>
            </div>
          </div>

          {!selectedIssueId ? <p className="muted">Select an issue card to open details.</p> : null}
          {selectedIssueId && loadingIssueDetail ? <p className="muted">Loading issue...</p> : null}
          {selectedIssueId && !loadingIssueDetail ? renderIssueDetailContent(false) : null}
        </aside>
      ) : null}

      {logoutConfirmOpen ? (
        <div className="modalOverlay logoutModalOverlay" onClick={cancelLogout}>
          <section
            className="panel logoutModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="logoutModalTitle"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="logoutModalTitle">Log Out of Fidux?</h3>
            <p className="muted">You can log back in anytime with your account credentials.</p>
            <div className="logoutModalActions">
              <button type="button" className="secondary" onClick={cancelLogout}>
                Cancel
              </button>
              <button type="button" onClick={confirmLogout}>
                Log Out
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {toast ? <div className={`toast ${toast.type}`}>{toast.message}</div> : null}
    </div>
  );
}
