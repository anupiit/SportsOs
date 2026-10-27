import type { BookingType } from '@prisma/client';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateBookingDto {
  @IsString() facilityId: string;
  @IsDateString() start: string;
  @IsDateString() end: string;
  @IsString() @MinLength(3) @MaxLength(200) purpose: string;
  @IsIn(['CASUAL', 'CLUB_PRACTICE', 'EVENT', 'MAINTENANCE']) type: BookingType;
  @IsOptional() @IsString() clubId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5000) participants?: number;
}

export class RejectBookingDto {
  @IsString() @MinLength(3) @MaxLength(300) reason: string;
}

export class CheckInBookingDto {
  @IsString() @MinLength(10) @MaxLength(200) token: string;
}
