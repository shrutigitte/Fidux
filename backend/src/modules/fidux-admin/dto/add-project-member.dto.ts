import { IsEmail, IsIn } from 'class-validator';

const projectRoles = ['PROJECT_ADMIN', 'PROJECT_MEMBER', 'PROJECT_VIEWER'] as const;

export type AssignableProjectRole = (typeof projectRoles)[number];

export class AddProjectMemberDto {
    @IsEmail()
    email!: string;

    @IsIn(projectRoles)
    role!: AssignableProjectRole;
}
