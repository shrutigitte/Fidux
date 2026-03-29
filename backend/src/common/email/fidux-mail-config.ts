import { ConfigService } from '@nestjs/config';

import { FiduxMailerConfig } from './fidux-mailer';

function readTrimmedValue(key: string, configService?: ConfigService) {
    if (configService) {
        return configService.get<string>(key)?.trim() || '';
    }

    return process.env[key]?.trim() || '';
}

export function resolveFiduxMailerConfig(
    configService?: ConfigService,
): FiduxMailerConfig {
    return {
        emailFrom: readTrimmedValue('EMAIL_FROM', configService),
        resendApiKey: readTrimmedValue('RESEND_API_KEY', configService),
        smtpHost: readTrimmedValue('SMTP_HOST', configService),
        smtpPort: resolveSmtpPort(readTrimmedValue('SMTP_PORT', configService)),
        smtpSecure: (readTrimmedValue('SMTP_SECURE', configService) || 'true') === 'true',
        smtpUser: readTrimmedValue('SMTP_USER', configService),
        smtpPass: readTrimmedValue('SMTP_PASS', configService),
    };
}

export function resolveFiduxWebAppBaseUrl(configService?: ConfigService) {
    return (
        readTrimmedValue('FIDUX_WEB_APP_URL', configService) ||
        readTrimmedValue('NEXTAUTH_URL', configService) ||
        'http://localhost:5173'
    );
}

export function resolveFiduxApiPublicBaseUrl(configService?: ConfigService) {
    const explicitApiBase = readTrimmedValue('FIDUX_API_PUBLIC_URL', configService);
    if (explicitApiBase) {
        return explicitApiBase.replace(/\/+$/, '');
    }

    const webAppBaseUrl = resolveFiduxWebAppBaseUrl(configService).replace(/\/+$/, '');
    return `${webAppBaseUrl}/api`;
}

export function resolveFiduxVerifyLinkBaseUrl(configService?: ConfigService) {
    const explicitVerifyLinkBase = readTrimmedValue('AUTH_VERIFY_LINK_BASE_URL', configService);
    if (explicitVerifyLinkBase) {
        return explicitVerifyLinkBase.replace(/\/+$/, '');
    }

    return `${resolveFiduxApiPublicBaseUrl(configService)}/auth/verify-email`;
}

function resolveSmtpPort(rawValue: string | undefined) {
    const parsed = Number.parseInt(rawValue ?? '465', 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
        return 465;
    }

    return parsed;
}
