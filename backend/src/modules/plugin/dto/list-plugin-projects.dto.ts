import { IsString, MinLength } from 'class-validator';

export class ListPluginProjectsDto {
    @IsString()
    @MinLength(1)
    orgId: string;
}
