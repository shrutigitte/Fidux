import { IsOptional, IsString } from 'class-validator';

export class ListMyProjectsDto {
    @IsOptional()
    @IsString()
    orgId?: string;
}

