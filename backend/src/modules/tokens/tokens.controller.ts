import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { TokensService } from './tokens.service';

@Controller('track')
export class TokensController {
    constructor(private readonly tokensService: TokensService) { }

    @Get(':token')
    validateToken(@Param('token') token: string) {
        return this.tokensService.validateToken(token);
    }
}
