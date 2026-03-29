import { IsIn } from 'class-validator';

const orgRoles = ['ORG_ADMIN', 'ORG_MEMBER'] as const;

export type AssignableOrgRole = (typeof orgRoles)[number];

export class UpdateOrgMemberRoleDto {
    @IsIn(orgRoles)
    role!: AssignableOrgRole;
}
