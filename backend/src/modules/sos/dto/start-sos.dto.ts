import { IsNumber, IsOptional, IsString } from 'class-validator';

export class StartSosDto {
    @IsNumber()
    lat: number;

    @IsNumber()
    lng: number;

    @IsOptional()
    @IsString()
    mode?: string;
}
