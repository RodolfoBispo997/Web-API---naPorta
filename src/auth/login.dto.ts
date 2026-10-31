import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { normalizeEmail } from './credentials.js';

export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail()
  @MaxLength(320)
  @ApiProperty({
    format: 'email',
    maxLength: 320,
    example: 'pessoa@example.test',
  })
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  @ApiProperty({
    type: String,
    minLength: 1,
    maxLength: 256,
    writeOnly: true,
    example: 'senha-ficticia',
    description: 'Máximo de 72 bytes UTF-8; sem regra de complexidade.',
  })
  password!: string;
}
