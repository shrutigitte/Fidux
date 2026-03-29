import { IsIn, IsInt, IsOptional } from 'class-validator';

export class RotatePatDto {
    @IsOptional()
    @IsInt()
    @IsIn([0, 24])
    graceHours?: number;

    @IsOptional()
    @IsInt()
    @IsIn([7, 30, 60, 90])
    expiryDays?: number;
}
