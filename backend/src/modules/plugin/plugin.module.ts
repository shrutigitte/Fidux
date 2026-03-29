import { Module } from '@nestjs/common';

import { PluginController } from './plugin.controller';
import { PluginService } from './plugin.service';
import { PluginStorageService } from './plugin-storage.service';
import { PluginRateLimitService } from './plugin-rate-limit.service';

@Module({
    controllers: [PluginController],
    providers: [PluginService, PluginStorageService, PluginRateLimitService],
})
export class PluginModule {}
