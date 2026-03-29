import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const issueStatuses = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const;
const issuePriorities = ['LOW', 'MEDIUM', 'HIGH'] as const;

export class CreateBoardIssueDto {
    @IsString()
    @MinLength(3)
    @MaxLength(200)
    title: string;

    @IsOptional()
    @IsString()
    @MaxLength(10000)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    description?: string;

    @IsOptional()
    @IsEnum(issuePriorities)
    priority?: (typeof issuePriorities)[number];

    @IsOptional()
    @IsEnum(issueStatuses)
    status?: (typeof issueStatuses)[number];

    @IsOptional()
    @Transform(({ value }) => {
        if (value === null) {
            return null;
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            return trimmed.length === 0 ? null : trimmed;
        }

        return value;
    })
    @IsString()
    assigneeId?: string | null;
}
