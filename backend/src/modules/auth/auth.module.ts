import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
    imports: [
        ConfigModule,
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => {
                const secret =
                    configService.get<string>('AUTH_JWT_SECRET')?.trim() ||
                    configService.get<string>('NEXTAUTH_SECRET')?.trim();

                if (!secret) {
                    throw new Error('AUTH_JWT_SECRET or NEXTAUTH_SECRET is required');
                }

                return {
                    secret,
                };
            },
        }),
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy, JwtAuthGuard],
    exports: [AuthService, JwtAuthGuard, PassportModule, JwtModule],
})
export class AuthModule { }
