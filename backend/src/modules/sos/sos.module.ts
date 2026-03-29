import { Module } from '@nestjs/common';
import { SosService } from './sos.service';
import { SosController } from './sos.controller';

@Module({
    controllers: [SosController],
    providers: [SosService],
})
export class SosModule { }
