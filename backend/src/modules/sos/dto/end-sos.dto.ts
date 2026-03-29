import { IsString } from 'class-validator';

export class EndSosDto {
    @IsString()
    pin: string;
}
