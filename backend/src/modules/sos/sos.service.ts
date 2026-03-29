import { Injectable } from '@nestjs/common';
import { StartSosDto } from './dto/start-sos.dto';
import { EndSosDto } from './dto/end-sos.dto';

@Injectable()
export class SosService {
    start(startSosDto: StartSosDto) {
        return 'This action starts an SOS alert';
    }

    end(endSosDto: EndSosDto) {
        return 'This action ends an SOS alert';
    }

    updateLocation(id: string, location: any) {
        return `Updating location for alert ${id}`;
    }
}
