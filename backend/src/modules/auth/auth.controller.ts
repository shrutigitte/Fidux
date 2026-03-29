import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { AuthenticatedUser } from './auth.types';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('register')
    register(@Body() registerDto: RegisterDto) {
        return this.authService.register(registerDto);
    }

    @Post('login')
    login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
    }

    @Post('google')
    googleLogin(@Body() payload: GoogleLoginDto) {
        return this.authService.googleLogin(payload);
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    me(@CurrentUser() currentUser: AuthenticatedUser) {
        return this.authService.me(currentUser);
    }

    @Post('change-password')
    @UseGuards(JwtAuthGuard)
    changePassword(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Body() payload: ChangePasswordDto,
    ) {
        return this.authService.changePassword(currentUser, payload);
    }

    @Post('email/verification/resend')
    @UseGuards(JwtAuthGuard)
    resendVerificationEmail(@CurrentUser() currentUser: AuthenticatedUser) {
        return this.authService.resendVerificationEmail(currentUser);
    }

    @Get('verify-email')
    verifyEmail(@Query('token') token: string) {
        return this.authService.verifyEmail(token);
    }
}
