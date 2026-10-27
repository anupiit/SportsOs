import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateItemDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsString() @MinLength(2) @MaxLength(40) sport: string;
  @IsString() @MinLength(2) @MaxLength(40) category: string;
  @IsInt() @Min(0) @Max(10_000) totalQty: number;
  @IsInt() @Min(0) @Max(10_000) minStock: number;
  @IsOptional() @IsString() @MaxLength(80) location?: string;
}

export class UpdateItemDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(40) category?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10_000) minStock?: number;
  @IsOptional() @IsString() @MaxLength(80) location?: string;
}

export class RestockDto {
  @IsInt() @Min(1) @Max(10_000) quantity: number;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class IssueDto {
  @IsOptional() @IsString() equipmentId?: string;
  @IsOptional() @IsString() qrCode?: string;
  /** Borrower's email or admission number. */
  @IsString() @MinLength(3) @MaxLength(120) borrower: string;
  @IsInt() @Min(1) @Max(100) quantity: number;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class ReturnDto {
  /** Items physically handed back (damaged ones included). */
  @IsInt() @Min(0) @Max(100) returnedQty: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) damagedQty?: number;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}
