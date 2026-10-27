import type { MatchStatus, TournamentFormat } from '@prisma/client';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateTournamentDto {
  @IsString() @MinLength(3) @MaxLength(120) name: string;
  @IsString() @MinLength(2) @MaxLength(40) sport: string;
  @IsIn(['SINGLE_ELIMINATION', 'ROUND_ROBIN']) format: TournamentFormat;
  @IsDateString() startDate: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() facilityId?: string;
}

export class AddTeamDto {
  @IsString() @MinLength(2) @MaxLength(60) name: string;
  @IsOptional() @IsString() @MaxLength(60) hostel?: string;
  @IsOptional() @IsInt() @Min(1) @Max(256) seed?: number;
}

export class GenerateDto {
  @IsOptional() @IsDateString() startAt?: string;
  @IsOptional() @IsInt() @Min(15) @Max(480) matchMinutes?: number;
}

export class UpdateMatchDto {
  @IsOptional() @IsInt() @Min(0) @Max(1000) homeScore?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000) awayScore?: number;
  @IsOptional() @IsIn(['SCHEDULED', 'LIVE', 'COMPLETED']) status?: Exclude<MatchStatus, 'BYE'>;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsString() facilityId?: string;
}
