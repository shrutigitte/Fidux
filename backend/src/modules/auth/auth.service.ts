import {
    BadRequestException,
    ConflictException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import { randomBytes } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { Pool, PoolClient, PoolConfig } from 'pg';

import {
    buildPasswordChangedEmail,
    buildVerificationEmail,
} from '../../common/email/fidux-email-builders';
import {
    resolveFiduxMailerConfig,
    resolveFiduxVerifyLinkBaseUrl,
    resolveFiduxWebAppBaseUrl,
} from '../../common/email/fidux-mail-config';
import { renderFiduxEmailHtml, renderFiduxEmailText } from '../../common/email/fidux-email-template';
import { sendFiduxEmail } from '../../common/email/fidux-mailer';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthJwtPayload, AuthenticatedUser } from './auth.types';

type UserRow = {
    id: string;
    email: string;
    name: string | null;
    imageUrl: string | null;
    passwordHash: string | null;
    googleSub: string | null;
    emailVerifiedAt: Date | null;
};

@Injectable()
export class AuthService {
    private readonly pool: Pool;
    private readonly jwtExpiresIn: string;
    private readonly bcryptRounds: number;
    private readonly googleClientId: string;
    private readonly googleOAuthClient: OAuth2Client;
    private readonly requireEmailVerified: boolean;
    private readonly verifyTokenExpiresHours: number;
    private readonly verifyLinkBaseUrl: string;
    private readonly webAppBaseUrl: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly jwtService: JwtService,
    ) {
        this.pool = new Pool(this.buildPoolConfig());
        this.jwtExpiresIn = this.configService.get<string>('AUTH_JWT_EXPIRES_IN')?.trim() || '7d';
        this.bcryptRounds = this.resolveBcryptRounds(
            this.configService.get<string>('AUTH_BCRYPT_ROUNDS'),
        );
        this.googleClientId = this.configService.get<string>('GOOGLE_CLIENT_ID')?.trim() || '';
        this.googleOAuthClient = new OAuth2Client(this.googleClientId || undefined);
        this.requireEmailVerified =
            (this.configService.get<string>('AUTH_REQUIRE_EMAIL_VERIFIED')?.trim() || 'false') ===
            'true';
        this.verifyTokenExpiresHours = this.resolveVerifyTokenExpiryHours(
            this.configService.get<string>('AUTH_VERIFY_TOKEN_EXPIRES_HOURS'),
        );
        this.verifyLinkBaseUrl = resolveFiduxVerifyLinkBaseUrl(this.configService);
        this.webAppBaseUrl = resolveFiduxWebAppBaseUrl(this.configService);
    }

    async register(registerDto: RegisterDto) {
        const email = this.normalizeEmail(registerDto.email);
        const name = registerDto.name.trim();
        const passwordHash = await hash(registerDto.password, this.bcryptRounds);
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            const existing = await this.findUserByEmail(client, email);
            let user: UserRow;

            if (existing?.passwordHash) {
                throw this.conflict('EMAIL_ALREADY_REGISTERED', 'Email already has a password account');
            }

            if (existing) {
                const updated = await client.query<UserRow>(
                    `
                        UPDATE "User"
                        SET name = $2,
                            "passwordHash" = $3,
                            "updatedAt" = NOW()
                        WHERE id = $1
                        RETURNING id, email, name, "imageUrl", "passwordHash", "googleSub", "emailVerifiedAt"
                    `,
                    [existing.id, name, passwordHash],
                );
                user = updated.rows[0];
            } else {
                const inserted = await client.query<UserRow>(
                    `
                        INSERT INTO "User" (
                            id,
                            email,
                            name,
                            "passwordHash",
                            "createdAt",
                            "updatedAt"
                        ) VALUES ($1, $2, $3, $4, NOW(), NOW())
                        RETURNING id, email, name, "imageUrl", "passwordHash", "googleSub", "emailVerifiedAt"
                    `,
                    [this.generateId('usr'), email, name, passwordHash],
                );
                user = inserted.rows[0];
            }

            const auth = await this.buildAuthResponse(user);
            const verification = await this.ensureVerificationEmailSent(user);

            if (verification.required && !verification.sent) {
                throw this.badRequest(
                    'EMAIL_DELIVERY_FAILED',
                    'Verification email could not be sent. Check email provider settings and try again.',
                    {
                        delivery: verification.delivery,
                        providerError: verification.error ?? null,
                    },
                );
            }

            await client.query('COMMIT');
            return {
                ...auth,
                emailVerification: verification,
            };
        } catch (error) {
            await client.query('ROLLBACK');
            if (this.isUniqueViolation(error)) {
                throw this.conflict('EMAIL_ALREADY_REGISTERED', 'Email already has an account');
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async login(loginDto: LoginDto) {
        const email = this.normalizeEmail(loginDto.email);
        const user = await this.findUserByEmail(email);

        if (!user) {
            throw this.unauthorized('INVALID_CREDENTIALS', 'Invalid email or password');
        }

        if (!user.passwordHash) {
            throw this.badRequest(
                'PASSWORD_LOGIN_DISABLED',
                'Password login is not enabled for this account. Use Google sign-in.',
            );
        }

        const passwordMatches = await compare(loginDto.password, user.passwordHash);
        if (!passwordMatches) {
            throw this.unauthorized('INVALID_CREDENTIALS', 'Invalid email or password');
        }

        if (this.requireEmailVerified && !user.emailVerifiedAt) {
            throw this.badRequest(
                'EMAIL_NOT_VERIFIED',
                'Email is not verified yet. Please verify your email before login.',
            );
        }

        return this.buildAuthResponse(user);
    }

    async googleLogin(payload: GoogleLoginDto) {
        const googleProfile = await this.verifyGoogleIdToken(payload.idToken);
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            let user = await this.findUserByGoogleSub(client, googleProfile.sub);

            if (user) {
                const updated = await client.query<UserRow>(
                    `
                        UPDATE "User"
                        SET email = $2,
                            name = COALESCE($3, name),
                            "imageUrl" = COALESCE($4, "imageUrl"),
                            "emailVerifiedAt" = COALESCE("emailVerifiedAt", $5),
                            "updatedAt" = NOW()
                        WHERE id = $1
                        RETURNING id, email, name, "imageUrl", "passwordHash", "googleSub", "emailVerifiedAt"
                    `,
                    [
                        user.id,
                        googleProfile.email,
                        googleProfile.name,
                        googleProfile.picture,
                        googleProfile.emailVerified ? new Date() : null,
                    ],
                );
                user = updated.rows[0];
            } else {
                const existingByEmail = await this.findUserByEmail(client, googleProfile.email);

                if (existingByEmail?.googleSub && existingByEmail.googleSub !== googleProfile.sub) {
                    throw this.conflict(
                        'GOOGLE_ACCOUNT_CONFLICT',
                        'This email is already linked to a different Google account',
                    );
                }

                if (existingByEmail) {
                    const linked = await client.query<UserRow>(
                        `
                            UPDATE "User"
                            SET "googleSub" = $2,
                                name = COALESCE($3, name),
                                "imageUrl" = COALESCE($4, "imageUrl"),
                                "emailVerifiedAt" = COALESCE("emailVerifiedAt", $5),
                                "updatedAt" = NOW()
                            WHERE id = $1
                            RETURNING id, email, name, "imageUrl", "passwordHash", "googleSub", "emailVerifiedAt"
                        `,
                        [
                            existingByEmail.id,
                            googleProfile.sub,
                            googleProfile.name,
                            googleProfile.picture,
                            googleProfile.emailVerified ? new Date() : null,
                        ],
                    );
                    user = linked.rows[0];
                } else {
                    const inserted = await client.query<UserRow>(
                        `
                            INSERT INTO "User" (
                                id,
                                email,
                                name,
                                "imageUrl",
                                "googleSub",
                                "emailVerifiedAt",
                                "createdAt",
                                "updatedAt"
                            ) VALUES (
                                $1,
                                $2,
                                $3,
                                $4,
                                $5,
                                $6,
                                NOW(),
                                NOW()
                            )
                            RETURNING id, email, name, "imageUrl", "passwordHash", "googleSub", "emailVerifiedAt"
                        `,
                        [
                            this.generateId('usr'),
                            googleProfile.email,
                            googleProfile.name,
                            googleProfile.picture,
                            googleProfile.sub,
                            googleProfile.emailVerified ? new Date() : null,
                        ],
                    );
                    user = inserted.rows[0];
                }
            }

            await client.query('COMMIT');
            return this.buildAuthResponse(user);
        } catch (error) {
            await client.query('ROLLBACK');
            if (this.isUniqueViolation(error)) {
                throw this.conflict(
                    'GOOGLE_ACCOUNT_CONFLICT',
                    'Google account could not be linked due to an existing account conflict',
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async me(currentUser: AuthenticatedUser) {
        const user = await this.findUserById(currentUser.userId);

        if (!user) {
            throw this.unauthorized('UNAUTHORIZED', 'Authenticated user not found');
        }

        return {
            user: this.toUserResponse(user),
        };
    }

    async changePassword(currentUser: AuthenticatedUser, payload: ChangePasswordDto) {
        const user = await this.findUserById(currentUser.userId);

        if (!user) {
            throw this.unauthorized('UNAUTHORIZED', 'Authenticated user not found');
        }

        if (!user.passwordHash) {
            throw this.badRequest(
                'PASSWORD_LOGIN_DISABLED',
                'Password login is not enabled for this account.',
            );
        }

        const currentMatches = await compare(payload.currentPassword, user.passwordHash);
        if (!currentMatches) {
            throw this.unauthorized('INVALID_CREDENTIALS', 'Current password is incorrect');
        }

        const sameAsCurrent = await compare(payload.newPassword, user.passwordHash);
        if (sameAsCurrent) {
            throw this.badRequest(
                'PASSWORD_UNCHANGED',
                'New password must be different from the current password',
            );
        }

        const nextPasswordHash = await hash(payload.newPassword, this.bcryptRounds);
        const updated = await this.pool.query<UserRow>(
            `
                UPDATE "User"
                SET "passwordHash" = $2,
                    "updatedAt" = NOW()
                WHERE id = $1
                RETURNING id, email, name, "imageUrl", "passwordHash", "googleSub", "emailVerifiedAt"
            `,
            [user.id, nextPasswordHash],
        );

        await this.sendPasswordChangedEmail(updated.rows[0]);

        return {
            changed: true,
            user: this.toUserResponse(updated.rows[0]),
        };
    }

    async resendVerificationEmail(currentUser: AuthenticatedUser) {
        const user = await this.findUserById(currentUser.userId);

        if (!user) {
            throw this.unauthorized('UNAUTHORIZED', 'Authenticated user not found');
        }

        if (user.emailVerifiedAt) {
            return {
                required: false,
                sent: false,
                alreadyVerified: true,
            };
        }

        const verification = await this.ensureVerificationEmailSent(user);
        return {
            ...verification,
            alreadyVerified: false,
        };
    }

    async verifyEmail(token: string) {
        const parsedToken = token?.trim();
        if (!parsedToken) {
            throw this.badRequest('VALIDATION_ERROR', 'Verification token is required');
        }

        let payload: AuthJwtPayload & { purpose?: string };
        try {
            payload = await this.jwtService.verifyAsync<AuthJwtPayload & { purpose?: string }>(
                parsedToken,
            );
        } catch {
            throw this.unauthorized('INVALID_VERIFY_TOKEN', 'Verification link is invalid or expired');
        }

        if (payload.purpose !== 'EMAIL_VERIFY' || !payload.sub || !payload.email) {
            throw this.unauthorized('INVALID_VERIFY_TOKEN', 'Verification link is invalid');
        }

        const result = await this.pool.query<UserRow>(
            `
                UPDATE "User"
                SET "emailVerifiedAt" = COALESCE("emailVerifiedAt", NOW()),
                    "updatedAt" = NOW()
                WHERE id = $1
                  AND email = $2
                RETURNING id, email, name, "imageUrl", "passwordHash", "googleSub", "emailVerifiedAt"
            `,
            [payload.sub, payload.email.trim().toLowerCase()],
        );

        const user = result.rows[0];
        if (!user) {
            throw this.unauthorized('INVALID_VERIFY_TOKEN', 'Verification link does not match account');
        }

        return {
            verified: true,
            user: this.toUserResponse(user),
        };
    }

    private async buildAuthResponse(user: UserRow) {
        const jwtPayload: AuthJwtPayload = {
            sub: user.id,
            email: user.email,
            name: user.name,
        };

        const accessToken = await this.jwtService.signAsync(jwtPayload, {
            expiresIn: this.jwtExpiresIn,
        });

        return {
            accessToken,
            tokenType: 'Bearer',
            expiresIn: this.jwtExpiresIn,
            user: this.toUserResponse(user),
        };
    }

    private toUserResponse(user: UserRow) {
        return {
            id: user.id,
            email: user.email,
            name: user.name,
            imageUrl: user.imageUrl,
            hasPassword: Boolean(user.passwordHash),
            hasGoogleLinked: Boolean(user.googleSub),
            emailVerified: Boolean(user.emailVerifiedAt),
        };
    }

    private normalizeEmail(email: string) {
        return email.trim().toLowerCase();
    }

    private resolveBcryptRounds(rawValue: string | undefined) {
        const parsed = Number.parseInt(rawValue ?? '12', 10);
        if (!Number.isFinite(parsed) || parsed < 10 || parsed > 14) {
            return 12;
        }

        return parsed;
    }

    private resolveVerifyTokenExpiryHours(rawValue: string | undefined) {
        const parsed = Number.parseInt(rawValue ?? '24', 10);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 168) {
            return 24;
        }
        return parsed;
    }

    private async ensureVerificationEmailSent(user: UserRow) {
        if (user.emailVerifiedAt) {
            return {
                required: false,
                sent: false,
                delivery: 'already_verified',
            };
        }

        const token = await this.jwtService.signAsync(
            {
                sub: user.id,
                email: user.email,
                name: user.name,
                purpose: 'EMAIL_VERIFY',
            },
            {
                expiresIn: `${this.verifyTokenExpiresHours}h`,
            },
        );

        const verifyUrl = `${this.verifyLinkBaseUrl}?token=${encodeURIComponent(token)}`;
        const email = buildVerificationEmail({
            accountEmail: user.email,
            expiresHours: this.verifyTokenExpiresHours,
            verifyUrl,
        });

        const text = renderFiduxEmailText(email.template);
        const html = renderFiduxEmailHtml(email.template);

        const delivery = await sendFiduxEmail(
            resolveFiduxMailerConfig(this.configService),
            {
                to: user.email,
                subject: email.subject,
                text,
                html,
                logTag: 'AUTH_EMAIL',
            },
        );

        if (delivery.sent) {
            return {
                required: true,
                sent: true,
                delivery: delivery.delivery,
            };
        }

        if (delivery.delivery === 'provider_not_configured') {
            // Dev fallback if no email provider key is configured.
            // eslint-disable-next-line no-console
            console.log(`[AUTH][DEV] Verification link for ${user.email}: ${verifyUrl}`);

            return {
                required: true,
                sent: true,
                delivery: 'dev_log',
                verifyUrl,
            };
        }

        return {
            required: true,
            sent: false,
            delivery: delivery.delivery,
            error: delivery.error ?? 'Failed to send verification email',
        };
    }

    private async sendPasswordChangedEmail(user: UserRow) {
        const securityUrl = `${this.webAppBaseUrl.replace(/\/$/, '')}?view=profile&section=security`;
        const email = buildPasswordChangedEmail({
            accountEmail: user.email,
            changedAtLabel: new Intl.DateTimeFormat('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Asia/Kolkata',
            }).format(new Date()),
            securityUrl,
        });

        const delivery = await sendFiduxEmail(resolveFiduxMailerConfig(this.configService), {
            to: user.email,
            subject: email.subject,
            text: renderFiduxEmailText(email.template),
            html: renderFiduxEmailHtml(email.template),
            logTag: 'AUTH_PASSWORD_CHANGED',
        });

        if (delivery.delivery === 'provider_not_configured') {
            // eslint-disable-next-line no-console
            console.log(`[AUTH][DEV] Password changed email skipped for ${user.email}. Link: ${securityUrl}`);
            return;
        }

        if (!delivery.sent) {
            // eslint-disable-next-line no-console
            console.error(
                `[AUTH][EMAIL] Password changed email failed for ${user.email}: ${
                    delivery.error || delivery.delivery
                }`,
            );
        }
    }

    private async verifyGoogleIdToken(idToken: string) {
        if (!this.googleClientId) {
            throw this.badRequest(
                'GOOGLE_AUTH_NOT_CONFIGURED',
                'GOOGLE_CLIENT_ID is required for Google login',
            );
        }

        let ticket;
        try {
            ticket = await this.googleOAuthClient.verifyIdToken({
                idToken: idToken.trim(),
                audience: this.googleClientId,
            });
        } catch {
            throw this.unauthorized('INVALID_GOOGLE_TOKEN', 'Google token verification failed');
        }

        const payload = ticket.getPayload();
        const email = payload?.email?.trim().toLowerCase();
        const sub = payload?.sub?.trim();

        if (!sub || !email) {
            throw this.unauthorized('INVALID_GOOGLE_TOKEN', 'Google token payload is missing identity');
        }

        return {
            sub,
            email,
            name: payload?.name?.trim() || null,
            picture: payload?.picture?.trim() || null,
            emailVerified: Boolean(payload?.email_verified),
        };
    }

    private async findUserByEmail(clientOrEmail: PoolClient | string, maybeEmail?: string) {
        if (typeof clientOrEmail === 'string') {
            return this.findUserByEmailQuery(undefined, clientOrEmail);
        }

        return this.findUserByEmailQuery(clientOrEmail, maybeEmail || '');
    }

    private async findUserByGoogleSub(client: PoolClient, googleSub: string) {
        const result = await client.query<UserRow>(
            `
                SELECT id, email, name, "imageUrl", "passwordHash", "googleSub", "emailVerifiedAt"
                FROM "User"
                WHERE "googleSub" = $1
                LIMIT 1
            `,
            [googleSub],
        );
        return result.rows[0] ?? null;
    }

    private async findUserById(userId: string) {
        const result = await this.pool.query<UserRow>(
            `
                SELECT id, email, name, "imageUrl", "passwordHash", "googleSub", "emailVerifiedAt"
                FROM "User"
                WHERE id = $1
                LIMIT 1
            `,
            [userId],
        );
        return result.rows[0] ?? null;
    }

    private async findUserByEmailQuery(client: PoolClient | undefined, email: string) {
        const runner = client ?? this.pool;
        const result = await runner.query<UserRow>(
            `
                SELECT id, email, name, "imageUrl", "passwordHash", "googleSub", "emailVerifiedAt"
                FROM "User"
                WHERE email = $1
                LIMIT 1
            `,
            [email],
        );
        return result.rows[0] ?? null;
    }

    private badRequest(code: string, message: string, details: Record<string, unknown> = {}) {
        return new BadRequestException({
            error: {
                code,
                message,
                details,
            },
        });
    }

    private conflict(code: string, message: string, details: Record<string, unknown> = {}) {
        return new ConflictException({
            error: {
                code,
                message,
                details,
            },
        });
    }

    private unauthorized(code: string, message: string, details: Record<string, unknown> = {}) {
        return new UnauthorizedException({
            error: {
                code,
                message,
                details,
            },
        });
    }

    private isUniqueViolation(error: unknown) {
        return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === '23505');
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
