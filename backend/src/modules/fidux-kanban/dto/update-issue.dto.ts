import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

const issueStatuses = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const;
const issuePriorities = ['LOW', 'MEDIUM', 'HIGH'] as const;

export class UpdateIssueDto {
    @IsOptional()
    @IsString()
    @MinLength(3)
    @MaxLength(200)
    title?: string;

    @IsOptional()
    @Transform(({ value }) => {
        if (value === null) {
            return null;
        }

        if (typeof value === 'string') {
            return value.trim();
        }

        return value;
    })
    @IsString()
    @MaxLength(10000)
    description?: string | null;

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

    @IsOptional()
    @IsInt()
    @Min(1)
    expectedVersion?: number;
}
