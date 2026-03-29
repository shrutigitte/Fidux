import { Injectable } from '@nestjs/common';

@Injectable()
export class TokensService {
    validateToken(token: string) {
        return `Validating token ${token}`;
    }
}
