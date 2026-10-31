import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

@ValidatorConstraint({ name: 'realCalendarDate', async: false })
class RealCalendarDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    const [year, month, day] = value.split('-').map(Number);
    if (year < 1 || month < 1 || month > 12 || day < 1) return false;

    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [
      31,
      leapYear ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31,
    ];
    return day <= daysInMonth[month - 1];
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a real calendar date in YYYY-MM-DD format.`;
  }
}

class CustomerDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @ApiProperty({
    type: String,
    maxLength: 200,
    minLength: 1,
    example: 'Cliente Fictício',
  })
  name!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  @ApiProperty({
    type: String,
    maxLength: 40,
    minLength: 1,
    example: 'DOC-DEMO-001',
  })
  document!: string;
}

class DeliveryAddressDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @ApiProperty({
    type: String,
    maxLength: 200,
    minLength: 1,
    example: 'Rua Exemplo',
  })
  street!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  @ApiProperty({ type: String, maxLength: 40, minLength: 1, example: '10' })
  number!: string;

  @Transform(trimText)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 120,
    minLength: 1,
    example: 'Sala 2',
  })
  complement?: string | null;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @ApiProperty({
    type: String,
    maxLength: 120,
    minLength: 1,
    example: 'Bairro Exemplo',
  })
  neighborhood!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @ApiProperty({
    type: String,
    maxLength: 120,
    minLength: 1,
    example: 'Cidade Fictícia',
  })
  city!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @ApiProperty({ type: String, maxLength: 120, minLength: 1, example: 'SP' })
  state!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @ApiProperty({
    type: String,
    maxLength: 32,
    minLength: 1,
    example: '00000-000',
  })
  postalCode!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @ApiProperty({ type: String, maxLength: 120, minLength: 1, example: 'BR' })
  country!: string;
}

export class CreateOrderItemDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @ApiProperty({
    type: String,
    minLength: 1,
    maxLength: 500,
    example: 'Produto fictício',
  })
  description!: string;

  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/, {
    message:
      'price must be a non-negative decimal string with at most 10 integer digits and 2 fractional digits.',
  })
  @ApiProperty({
    type: String,
    pattern: '^(?:0|[1-9]\\d{0,9})(?:\\.\\d{1,2})?$',
    example: '12.30',
    description:
      'String decimal não negativa, até 10 dígitos inteiros e 2 casas decimais.',
  })
  price!: string;
}

export class CreateOrderDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @ApiProperty({
    type: String,
    minLength: 1,
    maxLength: 64,
    example: 'PEDIDO-FICTICIO-001',
  })
  orderNumber!: string;

  @IsString()
  @Validate(RealCalendarDateConstraint)
  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-12-31',
    description: 'Data de calendário real em YYYY-MM-DD.',
  })
  expectedDeliveryDate!: string;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => CustomerDto)
  @ApiProperty({ type: () => CustomerDto })
  customer!: CustomerDto;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  @ApiProperty({ type: () => DeliveryAddressDto })
  deliveryAddress!: DeliveryAddressDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  @ApiProperty({ type: () => [CreateOrderItemDto], minItems: 1 })
  items!: CreateOrderItemDto[];
}

export { RealCalendarDateConstraint };
