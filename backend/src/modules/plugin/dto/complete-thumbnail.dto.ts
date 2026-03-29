import { IsString, MinLength } from 'class-validator';

export class CompleteThumbnailDto {
    @IsString()
    @MinLength(1)
    objectKey: string;
}
