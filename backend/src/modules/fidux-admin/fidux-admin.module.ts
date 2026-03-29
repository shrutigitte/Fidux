import { Module } from '@nestjs/common';

import { FiduxAdminController } from './fidux-admin.controller';
import { FiduxAdminService } from './fidux-admin.service';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [AuthModule],
    controllers: [FiduxAdminController],
    providers: [FiduxAdminService],
})
export class FiduxAdminModule {}
