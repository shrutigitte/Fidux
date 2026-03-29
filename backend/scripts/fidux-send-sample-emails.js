#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

require('ts-node/register/transpile-only');

function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }

        const separatorIndex = line.indexOf('=');
        if (separatorIndex === -1) {
            continue;
        }

        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim();
        if (!key || process.env[key]) {
            continue;
        }

        const unquoted =
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
                ? value.slice(1, -1)
                : value;

        process.env[key] = unquoted;
    }
}

async function main() {
    const rootDir = path.resolve(__dirname, '..');
    loadEnvFile(path.join(rootDir, '.env'));

    const {
        buildVerificationEmail,
        buildIssueAssignedEmail,
        buildMembershipGrantedEmail,
        buildPasswordChangedEmail,
    } = require('../src/common/email/fidux-email-builders');
    const {
        renderFiduxEmailHtml,
        renderFiduxEmailText,
    } = require('../src/common/email/fidux-email-template');
    const {
        resolveFiduxMailerConfig,
        resolveFiduxWebAppBaseUrl,
    } = require('../src/common/email/fidux-mail-config');
    const { sendFiduxEmail } = require('../src/common/email/fidux-mailer');

    const recipient = (process.argv[2] || 'shrutigitte@gmail.com').trim();
    const webAppBaseUrl = resolveFiduxWebAppBaseUrl().replace(/\/$/, '');
    const mailerConfig = resolveFiduxMailerConfig();

    const samples = [
        buildVerificationEmail({
            accountEmail: recipient,
            expiresHours: 24,
            verifyUrl: `${webAppBaseUrl}/verify-email?token=sample-verification-token`,
        }),
        buildIssueAssignedEmail({
            issueId: 'iss_demo9f1a4c2e',
            issueNumber: 'FDX-9F1A4C2E',
            issueTitle: 'Implement Environment Dashboard Graphs',
            projectName: 'Fidux App',
            assigneeLabel: 'Shruti Gitte',
            assignedByLabel: 'Workspace Admin',
            issueUrl: `${webAppBaseUrl}/?projectId=proj_demo123&issueId=iss_demo9f1a4c2e&view=full`,
            assignmentType: 'reassigned',
        }),
        buildMembershipGrantedEmail({
            scope: 'organization',
            workspaceName: 'Fidux',
            role: 'ORG_MEMBER',
            grantedByLabel: 'Workspace Admin',
            accessUrl: `${webAppBaseUrl}/?view=dashboard`,
        }),
        buildMembershipGrantedEmail({
            scope: 'project',
            workspaceName: 'Fidux App',
            role: 'PROJECT_MEMBER',
            grantedByLabel: 'Workspace Admin',
            accessUrl: `${webAppBaseUrl}/?projectId=proj_demo123&view=dashboard`,
            organizationName: 'Fidux',
        }),
        buildPasswordChangedEmail({
            accountEmail: recipient,
            changedAtLabel: new Intl.DateTimeFormat('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Asia/Kolkata',
            }).format(new Date()),
            securityUrl: `${webAppBaseUrl}/?view=profile&section=security`,
        }),
    ];

    const results = [];

    for (const sample of samples) {
        const result = await sendFiduxEmail(mailerConfig, {
            to: recipient,
            subject: `[Sample] ${sample.subject}`,
            text: renderFiduxEmailText(sample.template),
            html: renderFiduxEmailHtml(sample.template),
            logTag: 'FIDUX_SAMPLE_EMAIL',
        });

        results.push({
            subject: `[Sample] ${sample.subject}`,
            ...result,
        });
    }

    const failed = results.filter((entry) => !entry.sent);
    for (const entry of results) {
        console.log(
            `${entry.sent ? 'SENT ' : 'FAIL '} ${entry.subject} :: ${entry.delivery}${
                entry.error ? ` :: ${entry.error}` : ''
            }`,
        );
    }

    if (failed.length > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
