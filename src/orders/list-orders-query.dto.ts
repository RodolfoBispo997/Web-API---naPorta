import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({
    type: String,
    minLength: 1,
    example: 'DEMO-001',
    description: 'Correspondência exata após remover espaços externos.',
  })
  orderNumber?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  @ApiPropertyOptional({ enum: OrderStatus, example: 'PROCESSING' })
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  @Validate(RealCalendarDateConstraint)
  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2026-02-10',
    description: 'Início inclusivo de createdAt em UTC.',
  })
  startDate?: string;

  @IsOptional()
  @IsString()
  @Validate(RealCalendarDateConstraint)
  @Validate(DateRangeConstraint)
  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2026-02-10',
    description: 'Fim inclusivo de createdAt em UTC; não anterior a startDate.',
  })
  endDate?: string;

  @Transform(parseInteger)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 10000,
    default: 1,
    example: 1,
  })
  page = 1;

  @Transform(parseInteger)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 20,
    example: 20,
  })
  limit = 20;
}
