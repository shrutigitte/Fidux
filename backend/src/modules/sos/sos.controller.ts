import { Controller, Post, Body, Param } from '@nestjs/common';
import { SosService } from './sos.service';
import { StartSosDto } from './dto/start-sos.dto';
import { EndSosDto } from './dto/end-sos.dto';

@Controller('sos')
export class SosController {
    constructor(private readonly sosService: SosService) { }

    @Post('start')
    start(@Body() startSosDto: StartSosDto) {
        return this.sosService.start(startSosDto);
    }

    @Post('end')
    end(@Body() endSosDto: EndSosDto) {
        return this.sosService.end(endSosDto);
    }

    @Post(':id/location')
    updateLocation(@Param('id') id: string, @Body() location: any) {
        return this.sosService.updateLocation(id, location);
    }
}
