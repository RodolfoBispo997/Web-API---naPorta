import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsString,
  MaxLength,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { OrderStatus } from '../generated/prisma/client.js';
import { CreateOrderItemDto, RealCalendarDateConstraint } from './order.dto.js';

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

@ValidatorConstraint({ name: 'nonEmptyPatchObject', async: false })
class NonEmptyPatchObjectConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      Object.values(value).some((field) => field !== undefined)
    );
  }

  defaultMessage(): string {
    return 'nested objects must contain at least one editable field.';
  }
}

export class UpdateCustomerDto {
  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @ApiPropertyOptional({
    type: String,
    minLength: 1,
    maxLength: 200,
    example: 'Cliente Fictício Atualizado',
  })
  name?: string;

  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  @ApiPropertyOptional({
    type: String,
    minLength: 1,
    maxLength: 40,
    example: 'DOC-DEMO-001',
  })
  document?: string;
}

export class UpdateDeliveryAddressDto {
  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @ApiPropertyOptional({
    type: String,
    minLength: 1,
    maxLength: 200,
    example: 'Rua Exemplo',
  })
  street?: string;

  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  @ApiPropertyOptional({
    type: String,
    minLength: 1,
    maxLength: 40,
    example: '10',
  })
  number?: string;

  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    minLength: 1,
    maxLength: 120,
    example: null,
    description: 'null remove o complemento.',
  })
  complement?: string | null;

  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @ApiPropertyOptional({
    type: String,
    minLength: 1,
    maxLength: 120,
    example: 'Bairro Exemplo',
  })
  neighborhood?: string;

  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @ApiPropertyOptional({
    type: String,
    minLength: 1,
    maxLength: 120,
    example: 'Cidade Fictícia',
  })
  city?: string;

  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @ApiPropertyOptional({
    type: String,
    minLength: 1,
    maxLength: 120,
    example: 'SP',
  })
  state?: string;

  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @ApiPropertyOptional({
    type: String,
    minLength: 1,
    maxLength: 32,
    example: '00000-000',
  })
  postalCode?: string;

  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @ApiPropertyOptional({
    type: String,
    minLength: 1,
    maxLength: 120,
    example: 'BR',
  })
  country?: string;
}

export class UpdateOrderDto {
  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @ApiPropertyOptional({
    type: String,
    minLength: 1,
    maxLength: 64,
    example: 'PEDIDO-FICTICIO-001',
  })
  orderNumber?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(OrderStatus)
  @ApiPropertyOptional({ enum: OrderStatus, example: 'PROCESSING' })
  status?: OrderStatus;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Validate(RealCalendarDateConstraint)
  @ApiPropertyOptional({ type: String, format: 'date', example: '2026-12-31' })
  expectedDeliveryDate?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsObject()
  @Validate(NonEmptyPatchObjectConstraint)
  @ValidateNested()
  @Type(() => UpdateCustomerDto)
  @ApiPropertyOptional({
    type: () => UpdateCustomerDto,
    description: 'Informe ao menos um campo.',
  })
  customer?: UpdateCustomerDto;

  @ValidateIf((_object, value) => value !== undefined)
  @IsObject()
  @Validate(NonEmptyPatchObjectConstraint)
  @ValidateNested()
  @Type(() => UpdateDeliveryAddressDto)
  @ApiPropertyOptional({
    type: () => UpdateDeliveryAddressDto,
    description: 'Informe ao menos um campo; somente complement aceita null.',
  })
  deliveryAddress?: UpdateDeliveryAddressDto;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  @ApiPropertyOptional({
    type: () => [CreateOrderItemDto],
    minItems: 1,
    description: 'Quando informado, substitui todos os itens existentes.',
  })
  items?: CreateOrderItemDto[];
}
