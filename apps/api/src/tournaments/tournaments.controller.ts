import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser, RequireAnyPermission, RequirePermission } from '../common/decorators';
import { AddMemberDto, AddTeamDto, CreateTournamentDto, GenerateDto, ReviewDto, UpdateMatchDto, UpdateTournamentDto } from './tournaments.dto';
import { TournamentsService } from './tournaments.service';

@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly tournaments: TournamentsService) {}

  @Get()
  @RequirePermission('event.view')
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.tournaments.list(user, status);
  }

  @Get('leaderboard')
  @RequirePermission('event.view')
  leaderboard(@Query('sport') sport?: string) {
    return this.tournaments.leaderboard(sport);
  }

  @Get(':id')
  @RequirePermission('event.view')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tournaments.get(user, id);
  }

  @Post()
  @RequirePermission('event.create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTournamentDto) {
    return this.tournaments.create(user, dto);
  }

  @Patch(':id')
  @RequireAnyPermission('event.update', 'event.create')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTournamentDto) {
    return this.tournaments.update(user, id, dto);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('event.approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewDto) {
    return this.tournaments.review(user, id, true, dto.note);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('event.approve')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewDto) {
    return this.tournaments.review(user, id, false, dto.note);
  }

  @Post(':id/teams')
  @RequireAnyPermission('event.manage_participants', 'event.register_team')
  addTeam(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddTeamDto) {
    return this.tournaments.addTeam(user, id, dto);
  }

  @Delete(':id/teams/:teamId')
  @RequireAnyPermission('event.manage_participants', 'event.register_team')
  removeTeam(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('teamId') teamId: string) {
    return this.tournaments.removeTeam(user, id, teamId);
  }

  @Post(':id/teams/:teamId/members')
  @RequireAnyPermission('event.manage_participants', 'event.register_team')
  addMember(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('teamId') teamId: string, @Body() dto: AddMemberDto) {
    return this.tournaments.addMember(user, id, teamId, dto.student);
  }

  @Delete(':id/teams/:teamId/members/:memberId')
  @RequireAnyPermission('event.manage_participants', 'event.register_team')
  removeMember(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('teamId') teamId: string, @Param('memberId') memberId: string) {
    return this.tournaments.removeMember(user, id, teamId, memberId);
  }

  @Post(':id/generate')
  @HttpCode(200)
  @RequirePermission('event.publish')
  generate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: GenerateDto) {
    return this.tournaments.generate(user, id, dto);
  }
}

@Controller('matches')
export class MatchesController {
  constructor(private readonly tournaments: TournamentsService) {}

  @Patch(':id')
  @RequirePermission('event.record_results')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateMatchDto) {
    return this.tournaments.updateMatch(user, id, dto);
  }
}
