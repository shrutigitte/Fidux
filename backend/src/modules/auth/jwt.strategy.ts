import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AuthJwtPayload, AuthenticatedUser } from './auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(configService: ConfigService) {
        const jwtSecret =
            configService.get<string>('AUTH_JWT_SECRET')?.trim() ||
            configService.get<string>('NEXTAUTH_SECRET')?.trim();

        if (!jwtSecret) {
            throw new Error('AUTH_JWT_SECRET or NEXTAUTH_SECRET is required for JWT auth');
        }

        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: jwtSecret,
        });
    }

    validate(payload: AuthJwtPayload): AuthenticatedUser {
        if (!payload?.sub || !payload.email) {
            throw new UnauthorizedException('Invalid auth token payload');
        }

        return {
            userId: payload.sub,
            email: payload.email,
            name: payload.name ?? null,
        };
    }
}
