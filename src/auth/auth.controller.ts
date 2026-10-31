import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService, type LoginResponse } from './auth.service.js';
import { LoginDto } from './login.dto.js';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { loginResponseSchema } from '../swagger.schemas.js';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autenticar e obter token JWT' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: 'Token emitido.', schema: loginResponseSchema })
  @ApiBadRequestResponse({
    description: 'Entrada inválida ou senha acima de 72 bytes UTF-8.',
  })
  @ApiUnauthorizedResponse({ description: 'E-mail ou senha inválidos.' })
  login(@Body() credentials: LoginDto): Promise<LoginResponse> {
    return this.authService.login(credentials);
  }
}
