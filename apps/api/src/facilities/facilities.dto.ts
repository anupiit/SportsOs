import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { FacilityStatus, FacilityType } from '@prisma/client';

const TYPES: FacilityType[] = ['GROUND', 'COURT', 'INDOOR_HALL', 'POOL', 'GYM', 'TRACK'];
const STATUSES: FacilityStatus[] = ['OPEN', 'MAINTENANCE', 'CLOSED'];

export class CreateFacilityDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @Matches(/^[A-Z0-9-]{2,20}$/, { message: 'code must be 2-20 upper-case letters, digits or dashes' }) code: string;
  @IsIn(TYPES) type: FacilityType;
  @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) sports: string[];
  @IsLatitude() latitude: number;
  @IsLongitude() longitude: number;
  @IsInt() @Min(10) @Max(500) geofenceRadiusM: number;
  @IsInt() @Min(0) @Max(1439) openMinute: number;
  @IsInt() @Min(1) @Max(1440) closeMinute: number;
  @IsInt() @IsIn([30, 45, 60, 90, 120]) slotMinutes: number;
  @IsInt() @Min(1) @Max(5000) capacity: number;
  @IsBoolean() requiresApproval: boolean;
}

export class UpdateFacilityDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsIn(TYPES) type?: FacilityType;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) sports?: string[];
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
  @IsOptional() @IsInt() @Min(10) @Max(500) geofenceRadiusM?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1439) openMinute?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1440) closeMinute?: number;
  @IsOptional() @IsInt() @IsIn([30, 45, 60, 90, 120]) slotMinutes?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5000) capacity?: number;
  @IsOptional() @IsBoolean() requiresApproval?: boolean;
}

export class FacilityStatusDto {
  @IsIn(STATUSES) status: FacilityStatus;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}
