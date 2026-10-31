import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsNotEmpty,
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
  name!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  document!: string;
}

class DeliveryAddressDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  street!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  number!: string;

  @Transform(trimText)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  complement?: string | null;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  neighborhood!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  city!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  state!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  postalCode!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  country!: string;
}

class CreateOrderItemDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description!: string;

  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/, {
    message:
      'price must be a non-negative decimal string with at most 10 integer digits and 2 fractional digits.',
  })
  price!: string;
}

export class CreateOrderDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  orderNumber!: string;

  @IsString()
  @Validate(RealCalendarDateConstraint)
  expectedDeliveryDate!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => CustomerDto)
  customer!: CustomerDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  deliveryAddress!: DeliveryAddressDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}

export { RealCalendarDateConstraint };
