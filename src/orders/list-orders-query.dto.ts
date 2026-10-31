import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { OrderStatus } from '../generated/prisma/client.js';
import { RealCalendarDateConstraint } from './order.dto.js';

const trimOrderNumber = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const parseInteger = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return value;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : value;
};

@ValidatorConstraint({ name: 'dateRangeOrder', async: false })
class DateRangeConstraint implements ValidatorConstraintInterface {
  validate(endDate: unknown, args: ValidationArguments): boolean {
    const { startDate } = args.object as ListOrdersQueryDto;
    return (
      typeof startDate !== 'string' ||
      typeof endDate !== 'string' ||
      startDate <= endDate
    );
  }

  defaultMessage(): string {
    return 'startDate must be on or before endDate.';
  }
}

export class ListOrdersQueryDto {
  @Transform(trimOrderNumber)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  orderNumber?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  @Validate(RealCalendarDateConstraint)
  startDate?: string;

  @IsOptional()
  @IsString()
  @Validate(RealCalendarDateConstraint)
  @Validate(DateRangeConstraint)
  endDate?: string;

  @Transform(parseInteger)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  page = 1;

  @Transform(parseInteger)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
