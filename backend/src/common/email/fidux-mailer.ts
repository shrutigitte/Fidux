import * as nodemailer from 'nodemailer';

export type FiduxMailerConfig = {
    emailFrom: string;
    resendApiKey: string;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPass: string;
};

export type FiduxSendEmailInput = {
    to: string;
    subject: string;
    text: string;
    html: string;
    logTag: string;
};

export type FiduxSendEmailResult = {
    sent: boolean;
    delivery:
        | 'smtp'
        | 'smtp_failed'
        | 'resend'
        | 'resend_failed'
        | 'provider_not_configured';
    error?: string;
};

export async function sendFiduxEmail(
    config: FiduxMailerConfig,
    input: FiduxSendEmailInput,
): Promise<FiduxSendEmailResult> {
    if (config.smtpHost && config.emailFrom && config.smtpUser && config.smtpPass) {
        try {
            const transporter = nodemailer.createTransport({
                host: config.smtpHost,
                port: config.smtpPort,
                secure: config.smtpSecure,
                connectionTimeout: 10000,
                greetingTimeout: 10000,
                socketTimeout: 15000,
                auth: {
                    user: config.smtpUser,
                    pass: config.smtpPass,
                },
            });

            await transporter.sendMail({
                from: config.emailFrom,
                to: input.to,
                subject: input.subject,
                text: input.text,
                html: input.html,
            });

            return {
                sent: true,
                delivery: 'smtp',
            };
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error(
                `[${input.logTag}] SMTP delivery failed for ${input.to}: ${
                    error instanceof Error ? error.message : 'Unknown error'
                }`,
            );
            return {
                sent: false,
                delivery: 'smtp_failed',
                error: error instanceof Error ? error.message : 'Failed to send email',
            };
        }
    }

    if (config.resendApiKey && config.emailFrom) {
        try {
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${config.resendApiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: config.emailFrom,
                    to: [input.to],
                    subject: input.subject,
                    text: input.text,
                    html: input.html,
                }),
            });

            if (!response.ok) {
                const body = await response.text();
                throw new Error(`Resend error ${response.status}: ${body}`);
            }

            return {
                sent: true,
                delivery: 'resend',
            };
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error(
                `[${input.logTag}] Resend delivery failed for ${input.to}: ${
                    error instanceof Error ? error.message : 'Unknown error'
                }`,
            );
            return {
                sent: false,
                delivery: 'resend_failed',
                error: error instanceof Error ? error.message : 'Failed to send email',
            };
        }
    }

    return {
        sent: false,
        delivery: 'provider_not_configured',
    };
}
