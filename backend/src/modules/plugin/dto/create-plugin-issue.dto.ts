import {
    IsIn,
    IsInt,
    IsObject,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const issuePriorityValues = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type PluginIssuePriority = typeof issuePriorityValues[number];

export const thumbnailContentTypeValues = ['image/png', 'image/jpeg'] as const;

export class PluginIssueThumbnailDto {
    @IsString()
    @IsIn(thumbnailContentTypeValues)
    contentType: string;

    @IsInt()
    @Min(1)
    @Max(5 * 1024 * 1024)
    sizeBytes: number;
}

export class CreatePluginIssueDto {
    @IsString()
    @MinLength(1)
    projectId: string;

    @IsString()
    @MinLength(1)
    @MaxLength(200)
    title: string;

    @IsOptional()
    @IsString()
    @MaxLength(10_000)
    description?: string | null;

    @IsString()
    @IsIn(issuePriorityValues)
    priority: PluginIssuePriority;

    @IsString()
    @MinLength(1)
    figmaFileKey: string;

    @IsString()
    @MinLength(1)
    nodeId: string;

    @IsString()
    @MinLength(1)
    nodeName: string;

    @IsObject()
    @ValidateNested()
    @Type(() => PluginIssueThumbnailDto)
    thumbnail: PluginIssueThumbnailDto;
}
