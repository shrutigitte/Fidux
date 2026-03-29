import { Injectable } from '@nestjs/common';

@Injectable()
export class AuditsService {
    logAccess(alertId: string, tokenId: string, ip: string, userAgent: string) {
        // Log access
    }
}
