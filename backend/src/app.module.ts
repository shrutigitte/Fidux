import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './modules/auth/auth.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { SosModule } from './modules/sos/sos.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { LocationModule } from './modules/location/location.module';
import { TokensModule } from './modules/tokens/tokens.module';
import { AuditsModule } from './modules/audits/audits.module';
import { PluginModule } from './modules/plugin/plugin.module';
import { FiduxAdminModule } from './modules/fidux-admin/fidux-admin.module';
import { FiduxKanbanModule } from './modules/fidux-kanban/fidux-kanban.module';
import { HealthController } from './health.controller';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => {
                const databaseUrl = configService.get<string>('DATABASE_URL')?.trim();
                const useDatabaseUrl = Boolean(databaseUrl && databaseUrl !== 'REPLACE_ME');

                return {
                    type: 'postgres',
                    ...(useDatabaseUrl
                        ? {
                            url: databaseUrl,
                        }
                        : {
                            host: configService.get<string>('DB_HOST') || 'localhost',
                            port: parseInt(configService.get<string>('DB_PORT') || '5432', 10),
                            username: configService.get<string>('DB_USER') || 'postgres',
                            password: configService.get<string>('DB_PASSWORD') || 'postgres',
                            database: configService.get<string>('DB_NAME') || 'sos_db',
                        }),
                    entities: [__dirname + '/**/*.entity{.ts,.js}'],
                    synchronize: configService.get<string>('TYPEORM_SYNCHRONIZE') === 'true',
                };
            },
        }),
        ThrottlerModule.forRoot([{
            ttl: 60000,
            limit: 10,
        }]),
        AuthModule,
        ContactsModule,
        SosModule,
        TrackingModule,
        LocationModule,
        TokensModule,
        AuditsModule,
        PluginModule,
        FiduxAdminModule,
        FiduxKanbanModule,
    ],
    controllers: [HealthController],
})
export class AppModule { }
