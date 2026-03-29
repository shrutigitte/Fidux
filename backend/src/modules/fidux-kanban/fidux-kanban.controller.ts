import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    UseFilters,
    UseGuards,
    UsePipes,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { CreateBoardIssueDto } from './dto/create-board-issue.dto';
import { ListProjectNotificationsDto } from './dto/list-project-notifications.dto';
import { ListProjectIssuesDto } from './dto/list-project-issues.dto';
import { ListMyProjectsDto } from './dto/list-my-projects.dto';
import { MoveIssueDto } from './dto/move-issue.dto';
import { SendIssueMessageDto } from './dto/send-issue-message.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { FiduxKanbanExceptionFilter } from './fidux-kanban-exception.filter';
import {
    fiduxKanbanQueryValidationPipe,
    fiduxKanbanValidationPipe,
} from './fidux-kanban-validation.pipe';
import { FiduxKanbanService } from './fidux-kanban.service';

@Controller()
@UseFilters(new FiduxKanbanExceptionFilter())
@UseGuards(JwtAuthGuard)
export class FiduxKanbanController {
    constructor(private readonly fiduxKanbanService: FiduxKanbanService) {}

    @Get('projects')
    @UsePipes(fiduxKanbanQueryValidationPipe)
    listMyProjects(@CurrentUser() currentUser: AuthenticatedUser, @Query() query: ListMyProjectsDto) {
        return this.fiduxKanbanService.listMyProjects(currentUser, query);
    }

    @Get('projects/:projectId/issues')
    @UsePipes(fiduxKanbanQueryValidationPipe)
    listProjectIssues(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param('projectId') projectId: string,
        @Query() query: ListProjectIssuesDto,
    ) {
        return this.fiduxKanbanService.listProjectIssues(currentUser, projectId, query);
    }

    @Get('projects/:projectId/participants')
    listProjectParticipants(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param('projectId') projectId: string,
    ) {
        return this.fiduxKanbanService.listProjectParticipants(currentUser, projectId);
    }

    @Get('projects/:projectId/notifications')
    @UsePipes(fiduxKanbanQueryValidationPipe)
    listProjectNotifications(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param('projectId') projectId: string,
        @Query() query: ListProjectNotificationsDto,
    ) {
        return this.fiduxKanbanService.listProjectNotifications(currentUser, projectId, query);
    }

    @Post('projects/:projectId/issues')
    @UsePipes(fiduxKanbanValidationPipe)
    createIssue(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param('projectId') projectId: string,
        @Body() payload: CreateBoardIssueDto,
    ) {
        return this.fiduxKanbanService.createIssue(currentUser, projectId, payload);
    }

    @Get('issues/:issueId')
    getIssue(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param('issueId') issueId: string,
    ) {
        return this.fiduxKanbanService.getIssue(currentUser, issueId);
    }

    @Patch('issues/:issueId')
    @UsePipes(fiduxKanbanValidationPipe)
    updateIssue(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param('issueId') issueId: string,
        @Body() payload: UpdateIssueDto,
    ) {
        return this.fiduxKanbanService.updateIssue(currentUser, issueId, payload);
    }

    @Post('issues/:issueId/move')
    @UsePipes(fiduxKanbanValidationPipe)
    moveIssue(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param('issueId') issueId: string,
        @Body() payload: MoveIssueDto,
    ) {
        return this.fiduxKanbanService.moveIssue(currentUser, issueId, payload);
    }

    @Post('issues/:issueId/archive')
    archiveIssue(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param('issueId') issueId: string,
    ) {
        return this.fiduxKanbanService.archiveIssue(currentUser, issueId);
    }

    @Delete('issues/:issueId')
    deleteIssue(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param('issueId') issueId: string,
    ) {
        return this.fiduxKanbanService.deleteIssue(currentUser, issueId);
    }

    @Get('issues/:issueId/messages')
    listIssueMessages(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param('issueId') issueId: string,
    ) {
        return this.fiduxKanbanService.listIssueMessages(currentUser, issueId);
    }

    @Get('issues/:issueId/activity')
    listIssueActivity(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param('issueId') issueId: string,
    ) {
        return this.fiduxKanbanService.listIssueActivity(currentUser, issueId);
    }

    @Post('issues/:issueId/messages')
    @UsePipes(fiduxKanbanValidationPipe)
    sendIssueMessage(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param('issueId') issueId: string,
        @Body() payload: SendIssueMessageDto,
    ) {
        return this.fiduxKanbanService.sendIssueMessage(currentUser, issueId, payload);
    }
}
