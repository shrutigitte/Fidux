import {
    Body,
    Controller,
    Get,
    Headers,
    HttpCode,
    Param,
    Post,
    Query,
    Req,
    UseFilters,
    UsePipes,
} from '@nestjs/common';
import { Request } from 'express';

import { PluginService } from './plugin.service';
import { ListPluginProjectsDto } from './dto/list-plugin-projects.dto';
import { CreatePluginIssueDto } from './dto/create-plugin-issue.dto';
import { CompleteThumbnailDto } from './dto/complete-thumbnail.dto';
import { PluginRateLimitService } from './plugin-rate-limit.service';
import { PluginExceptionFilter } from './plugin-exception.filter';
import { pluginQueryValidationPipe, pluginValidationPipe } from './plugin-validation.pipe';

@Controller('plugin')
@UseFilters(new PluginExceptionFilter())
export class PluginController {
    constructor(
        private readonly pluginService: PluginService,
        private readonly pluginRateLimitService: PluginRateLimitService,
    ) {}

    @Post('pats/verify')
    @HttpCode(200)
    verifyPat(
        @Headers('authorization') authorizationHeader: string | undefined,
        @Req() request: Request,
    ) {
        this.pluginRateLimitService.enforce('plugin.pats.verify', authorizationHeader, request.ip, {
            limitPerMinute: 30,
            burstMultiplier: 2,
            burstWindowSeconds: 10,
        });
        return this.pluginService.verifyPat(authorizationHeader);
    }

    @Get('projects')
    @UsePipes(pluginQueryValidationPipe)
    listProjects(
        @Headers('authorization') authorizationHeader: string | undefined,
        @Query() query: ListPluginProjectsDto,
        @Req() request: Request,
    ) {
        this.pluginRateLimitService.enforce('plugin.projects.list', authorizationHeader, request.ip, {
            limitPerMinute: 60,
            burstMultiplier: 2,
            burstWindowSeconds: 10,
        });
        return this.pluginService.listProjects(authorizationHeader, query);
    }

    @Post('issues')
    @UsePipes(pluginValidationPipe)
    createIssue(
        @Headers('authorization') authorizationHeader: string | undefined,
        @Headers('idempotency-key') idempotencyKey: string | undefined,
        @Body() payload: CreatePluginIssueDto,
        @Req() request: Request,
    ) {
        this.pluginRateLimitService.enforce('plugin.issues.create', authorizationHeader, request.ip, {
            limitPerMinute: 20,
            burstMultiplier: 2,
            burstWindowSeconds: 10,
        });
        return this.pluginService.createIssue(authorizationHeader, idempotencyKey, payload);
    }

    @Post('issues/:issueId/thumbnail/complete')
    @HttpCode(200)
    @UsePipes(pluginValidationPipe)
    completeThumbnail(
        @Headers('authorization') authorizationHeader: string | undefined,
        @Param('issueId') issueId: string,
        @Body() payload: CompleteThumbnailDto,
        @Req() request: Request,
    ) {
        this.pluginRateLimitService.enforce(
            'plugin.issues.thumbnail.complete',
            authorizationHeader,
            request.ip,
            {
                limitPerMinute: 30,
                burstMultiplier: 2,
                burstWindowSeconds: 10,
            },
        );
        return this.pluginService.completeThumbnail(authorizationHeader, issueId, payload);
    }
}
