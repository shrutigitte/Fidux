import { IsIn } from 'class-validator';

const projectRoles = ['PROJECT_ADMIN', 'PROJECT_MEMBER', 'PROJECT_VIEWER'] as const;

export type AssignableProjectRole = (typeof projectRoles)[number];

export class UpdateProjectMemberRoleDto {
    @IsIn(projectRoles)
    role!: AssignableProjectRole;
}
