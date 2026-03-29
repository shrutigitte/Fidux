import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    UseFilters,
    UseGuards,
    UsePipes,
} from '@nestjs/common';

import { FiduxAdminService } from './fidux-admin.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreatePatDto } from './dto/create-pat.dto';
import { RotatePatDto } from './dto/rotate-pat.dto';
import { AddOrgMemberDto } from './dto/add-org-member.dto';
import { UpdateOrgMemberRoleDto } from './dto/update-org-member-role.dto';
import { AddProjectMemberDto } from './dto/add-project-member.dto';
import { UpdateProjectMemberRoleDto } from './dto/update-project-member-role.dto';
import { fiduxAdminValidationPipe } from './fidux-admin-validation.pipe';
import { FiduxAdminExceptionFilter } from './fidux-admin-exception.filter';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';

@Controller()
@UseFilters(new FiduxAdminExceptionFilter())
@UseGuards(JwtAuthGuard)
export class FiduxAdminController {
    constructor(private readonly fiduxAdminService: FiduxAdminService) {}

    @Post('orgs')
    @UsePipes(fiduxAdminValidationPipe)
    createOrganization(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Body() payload: CreateOrganizationDto,
    ) {
        return this.fiduxAdminService.createOrganization(currentUser, payload);
    }

    @Post('orgs/:orgId/projects')
    @UsePipes(fiduxAdminValidationPipe)
    createProject(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param('orgId') orgId: string,
        @Body() payload: CreateProjectDto,
    ) {
        return this.fiduxAdminService.createProject(currentUser, orgId, payload);
    }

    @Get('orgs/mine')
    listMyOrganizations(@CurrentUser() currentUser: AuthenticatedUser) {
        return this.fiduxAdminService.listMyOrganizations(currentUser);
    }

    @Get('orgs/:orgId/members')
    listOrgMembers(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param('orgId') orgId: string,
    ) {
        return this.fiduxAdminService.listOrgMembers(currentUser, orgId);
    }

    @Post('orgs/:orgId/members')
    @UsePipes(fiduxAdminValidationPipe)
    addOrgMember(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param('orgId') orgId: string,
        @Body() payload: AddOrgMemberDto,
    ) {
        return this.fiduxAdminService.addOrgMember(currentUser, orgId, payload);
    }

    @Patch('orgs/:orgId/members/:userId/role')
    @UsePipes(fiduxAdminValidationPipe)
    updateOrgMemberRole(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param('orgId') orgId: string,
        @Param('userId') userId: string,
        @Body() payload: UpdateOrgMemberRoleDto,
    ) {
        return this.fiduxAdminService.updateOrgMemberRole(currentUser, orgId, userId, payload);
    }

    @Get('projects/:projectId/members')
    listProjectMembers(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param('projectId') projectId: string,
    ) {
        return this.fiduxAdminService.listProjectMembers(currentUser, projectId);
    }

    @Post('projects/:projectId/members')
    @UsePipes(fiduxAdminValidationPipe)
    addProjectMember(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param('projectId') projectId: string,
        @Body() payload: AddProjectMemberDto,
    ) {
        return this.fiduxAdminService.addProjectMember(currentUser, projectId, payload);
    }

    @Patch('projects/:projectId/members/:userId/role')
    @UsePipes(fiduxAdminValidationPipe)
    updateProjectMemberRole(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param('projectId') projectId: string,
        @Param('userId') userId: string,
        @Body() payload: UpdateProjectMemberRoleDto,
    ) {
        return this.fiduxAdminService.updateProjectMemberRole(
            currentUser,
            projectId,
            userId,
            payload,
        );
    }

    @Get('orgs/:orgId/pats')
    listPats(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param('orgId') orgId: string,
    ) {
        return this.fiduxAdminService.listPats(currentUser, orgId);
    }

    @Post('orgs/:orgId/pats')
    @UsePipes(fiduxAdminValidationPipe)
    createPat(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param('orgId') orgId: string,
        @Body() payload: CreatePatDto,
    ) {
        return this.fiduxAdminService.createPat(currentUser, orgId, payload);
    }

    @Post('orgs/:orgId/pats/:patId/revoke')
    @HttpCode(200)
    revokePat(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param('orgId') orgId: string,
        @Param('patId') patId: string,
    ) {
        return this.fiduxAdminService.revokePat(currentUser, orgId, patId);
    }

    @Patch('orgs/:orgId/pats/:patId/rotate')
    @HttpCode(200)
    @UsePipes(fiduxAdminValidationPipe)
    rotatePat(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param('orgId') orgId: string,
        @Param('patId') patId: string,
        @Body() payload: RotatePatDto,
    ) {
        return this.fiduxAdminService.rotatePat(currentUser, orgId, patId, payload);
    }
}
