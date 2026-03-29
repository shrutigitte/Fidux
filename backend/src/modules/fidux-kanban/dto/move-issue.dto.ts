import { IsEnum, IsInt, Min } from 'class-validator';

const issueStatuses = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const;

export class MoveIssueDto {
    @IsEnum(issueStatuses)
    toStatus: (typeof issueStatuses)[number];

    @IsInt()
    @Min(1)
    expectedVersion: number;
}
