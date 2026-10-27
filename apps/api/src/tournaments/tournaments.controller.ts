import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { AddTeamDto, CreateTournamentDto, GenerateDto, UpdateMatchDto } from './tournaments.dto';
import { TournamentsService } from './tournaments.service';

@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly tournaments: TournamentsService) {}

  @Get()
  list() {
    return this.tournaments.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.tournaments.get(id);
  }

  @Post()
  @RequirePermission('events:manage')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTournamentDto) {
    return this.tournaments.create(user, dto);
  }

  @Post(':id/teams')
  @RequirePermission('events:manage')
  addTeam(@Param('id') id: string, @Body() dto: AddTeamDto) {
    return this.tournaments.addTeam(id, dto);
  }

  @Delete(':id/teams/:teamId')
  @RequirePermission('events:manage')
  removeTeam(@Param('id') id: string, @Param('teamId') teamId: string) {
    return this.tournaments.removeTeam(id, teamId);
  }

  @Post(':id/generate')
  @HttpCode(200)
  @RequirePermission('events:manage')
  generate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: GenerateDto) {
    return this.tournaments.generate(user, id, dto);
  }
}

@Controller('matches')
export class MatchesController {
  constructor(private readonly tournaments: TournamentsService) {}

  @Patch(':id')
  @RequirePermission('events:score')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateMatchDto) {
    return this.tournaments.updateMatch(user, id, dto);
  }
}
