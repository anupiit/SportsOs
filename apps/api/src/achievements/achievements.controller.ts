import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type { AchievementLevel } from '@prisma/client';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { AchievementsService } from './achievements.service';

export class CreateAchievementDto {
  @IsString() @MinLength(3) @MaxLength(160) title: string;
  @IsString() @MinLength(2) @MaxLength(40) sport: string;
  @IsIn(['HOSTEL', 'INSTITUTE', 'INTER_IIT', 'STATE', 'NATIONAL', 'INTERNATIONAL']) level: AchievementLevel;
  @IsOptional() @IsString() @MaxLength(40) position?: string;
  @IsDateString() date: string;
}

@Controller('achievements')
export class AchievementsController {
  constructor(private readonly achievements: AchievementsService) {}

  @Get()
  list(@Query('userId') userId?: string, @Query('verified') verified?: string) {
    return this.achievements.list(userId, verified === undefined ? undefined : verified === 'true');
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAchievementDto) {
    return this.achievements.create(user, dto);
  }

  @Post(':id/verify')
  @HttpCode(200)
  @RequirePermission('achievement.verify')
  verify(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.achievements.verify(user, id);
  }
}
