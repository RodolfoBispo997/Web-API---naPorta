import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService, type LoginResponse } from './auth.service.js';
import { LoginDto } from './login.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() credentials: LoginDto): Promise<LoginResponse> {
    return this.authService.login(credentials);
  }
}
