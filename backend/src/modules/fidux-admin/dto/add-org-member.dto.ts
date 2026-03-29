import { IsEmail, IsIn } from 'class-validator';

const orgRoles = ['ORG_ADMIN', 'ORG_MEMBER'] as const;

export type AssignableOrgRole = (typeof orgRoles)[number];

export class AddOrgMemberDto {
    @IsEmail()
    email!: string;

    @IsIn(orgRoles)
    role!: AssignableOrgRole;
}
