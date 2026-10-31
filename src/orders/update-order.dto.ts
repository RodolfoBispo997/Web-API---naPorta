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
  name?: string;

  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  document?: string;
}

export class UpdateDeliveryAddressDto {
  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  street?: string;

  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  number?: string;

  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  complement?: string | null;

  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  neighborhood?: string;

  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  city?: string;

  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  state?: string;

  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  postalCode?: string;

  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  country?: string;
}

export class UpdateOrderDto {
  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  orderNumber?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Validate(RealCalendarDateConstraint)
  expectedDeliveryDate?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsObject()
  @Validate(NonEmptyPatchObjectConstraint)
  @ValidateNested()
  @Type(() => UpdateCustomerDto)
  customer?: UpdateCustomerDto;

  @ValidateIf((_object, value) => value !== undefined)
  @IsObject()
  @Validate(NonEmptyPatchObjectConstraint)
  @ValidateNested()
  @Type(() => UpdateDeliveryAddressDto)
  deliveryAddress?: UpdateDeliveryAddressDto;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items?: CreateOrderItemDto[];
}
