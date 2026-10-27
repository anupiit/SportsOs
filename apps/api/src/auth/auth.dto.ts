import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(1) @MaxLength(200) password: string;
}

export class RegisterDto {
  @IsString() @MinLength(2) @MaxLength(100) name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) @MaxLength(200) password: string;
  @IsOptional() @Matches(/^[0-9]{2}[A-Za-z]{2}[0-9]{4}$/, { message: 'admissionNo must look like 22JE0143' }) admissionNo?: string;
  @IsOptional() @IsString() @MaxLength(60) hostel?: string;
  @IsOptional() @Matches(/^\+?[0-9 ]{7,15}$/) phone?: string;
}
