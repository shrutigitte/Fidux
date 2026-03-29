import { FiduxEmailTemplateInput } from './fidux-email-template';

export type FiduxBuiltEmail = {
    subject: string;
    template: FiduxEmailTemplateInput;
};

export function buildVerificationEmail(params: {
    accountEmail: string;
    expiresHours: number;
    verifyUrl: string;
}): FiduxBuiltEmail {
    return {
        subject: 'Verify your Fidux account',
        template: {
            preheader: 'Verify your Fidux account email address.',
            badge: 'Email Verification',
            title: 'Verify your Fidux account',
            intro: 'Confirm your email address to secure your account and unlock your Fidux workspace.',
            facts: [
                { label: 'Account Email', value: params.accountEmail },
                { label: 'Link Expires', value: `${params.expiresHours} hour(s)` },
            ],
            ctaLabel: 'Verify Email',
            ctaUrl: params.verifyUrl,
            helperText:
                'If the button does not work, copy the verification link below and open it in your browser.',
            footerNote:
                'If you did not create this account, you can safely ignore this email. No changes will be made.',
        },
    };
}

export function buildIssueAssignedEmail(params: {
    issueId: string;
    issueNumber: string;
    issueTitle: string;
    projectName: string;
    assigneeLabel: string;
    assignedByLabel: string;
    issueUrl: string;
    assignmentType: 'created' | 'reassigned';
}): FiduxBuiltEmail {
    const intro =
        params.assignmentType === 'created'
            ? `${params.assignedByLabel} created a new issue and assigned it to you in ${params.projectName}.`
            : `${params.assignedByLabel} assigned an issue to you in ${params.projectName}.`;

    return {
        subject: `${params.issueNumber} assigned to you in Fidux`,
        template: {
            preheader: `${params.issueNumber} assigned to you in Fidux`,
            badge: 'Issue Assigned',
            title: `Assigned: ${params.issueTitle}`,
            intro,
            facts: [
                { label: 'Issue Number', value: params.issueNumber },
                { label: 'Issue ID', value: params.issueId },
                { label: 'Issue Title', value: params.issueTitle },
                { label: 'Assigned To', value: params.assigneeLabel },
                { label: 'Assigned By', value: params.assignedByLabel },
                { label: 'Project', value: params.projectName },
            ],
            ctaLabel: 'Open Issue in Fidux',
            ctaUrl: params.issueUrl,
            helperText: 'Use the button to open the issue directly in Fidux.',
            footerNote:
                'This is an automated assignment notification from Fidux. Update your issue preferences in app settings.',
        },
    };
}

export function buildMembershipGrantedEmail(params: {
    scope: 'organization' | 'project';
    workspaceName: string;
    role: string;
    grantedByLabel: string;
    accessUrl: string;
    organizationName?: string;
}): FiduxBuiltEmail {
    const isProject = params.scope === 'project';
    const subject = isProject
        ? `Project access granted: ${params.workspaceName}`
        : `You were added to ${params.workspaceName} in Fidux`;

    return {
        subject,
        template: {
            preheader: subject,
            badge: isProject ? 'Project Access' : 'Workspace Access',
            title: isProject
                ? `You now have access to ${params.workspaceName}`
                : `Welcome to ${params.workspaceName}`,
            intro: isProject
                ? `${params.grantedByLabel} added you to the project ${params.workspaceName} in Fidux.`
                : `${params.grantedByLabel} added you to the organization ${params.workspaceName} in Fidux.`,
            facts: [
                { label: isProject ? 'Project' : 'Organization', value: params.workspaceName },
                { label: 'Role', value: params.role },
                { label: 'Added By', value: params.grantedByLabel },
                ...(params.organizationName && isProject
                    ? [{ label: 'Organization', value: params.organizationName }]
                    : []),
            ],
            ctaLabel: isProject ? 'Open Project' : 'Open Workspace',
            ctaUrl: params.accessUrl,
            helperText:
                'Use the button to open Fidux and confirm your access. If the page does not open directly, use the link below.',
            footerNote:
                'You received this email because your access changed in a Fidux workspace. Contact your workspace admin if this was unexpected.',
        },
    };
}

export function buildPasswordChangedEmail(params: {
    accountEmail: string;
    changedAtLabel: string;
    securityUrl: string;
}): FiduxBuiltEmail {
    return {
        subject: 'Your Fidux password was changed',
        template: {
            preheader: 'Your Fidux password was changed.',
            badge: 'Security Alert',
            title: 'Your password was updated',
            intro:
                'This is a confirmation that your Fidux password was changed successfully. If this was not you, secure your account immediately.',
            facts: [
                { label: 'Account Email', value: params.accountEmail },
                { label: 'Changed At', value: params.changedAtLabel },
            ],
            ctaLabel: 'Review Account Security',
            ctaUrl: params.securityUrl,
            helperText:
                'Open your account security settings if you need to review your sessions or update your credentials again.',
            footerNote:
                'If you did not make this change, reset your password immediately and contact your workspace administrator.',
        },
    };
}
