import { IsEnum, IsOptional, IsString } from 'class-validator';

const issueStatuses = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const;

export type KanbanIssueStatus = (typeof issueStatuses)[number];

export class ListProjectIssuesDto {
    @IsOptional()
    @IsEnum(issueStatuses)
    status?: KanbanIssueStatus;

    @IsOptional()
    @IsString()
    assignee?: string;
}
