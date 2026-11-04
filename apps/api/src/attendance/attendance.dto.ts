import { IsDateString, IsIn, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateSessionDto {
  @IsString() @MinLength(3) @MaxLength(120) title: string;
  @IsString() facilityId: string;
  @IsOptional() @IsString() clubId?: string;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsDateString() endsAt: string;
}

export class CheckInDto {
  @IsString() sessionId: string;
  @Matches(/^\d{6}$/, { message: 'otp must be 6 digits' }) otp: string;
  @IsLatitude() latitude: number;
  @IsLongitude() longitude: number;
  @IsNumber() @Min(0) @Max(100_000) accuracyM: number;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(100) deviceId?: string;
}

export class CorrectionDto {
  /** user id, email or admission number */
  @IsString() @MinLength(3) @MaxLength(120) student: string;
  @IsIn(['ADD', 'REMOVE']) action: 'ADD' | 'REMOVE';
  @IsString() @MinLength(5) @MaxLength(300) reason: string;
}
