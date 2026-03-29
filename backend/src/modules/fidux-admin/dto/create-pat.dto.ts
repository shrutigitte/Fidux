import { IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const allowedScopes = ['plugin:read_projects', 'plugin:write_issues'] as const;

export class CreatePatDto {
    @IsString()
    @MinLength(2)
    @MaxLength(80)
    name: string;

    @IsArray()
    @IsString({ each: true })
    @IsIn(allowedScopes, { each: true })
    scopes: string[];

    @IsOptional()
    @IsInt()
    @IsIn([7, 30, 60, 90])
    expiryDays?: number;
}
