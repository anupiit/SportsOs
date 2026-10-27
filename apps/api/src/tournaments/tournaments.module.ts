import { Module } from '@nestjs/common';
import { MatchesController, TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';

@Module({
  controllers: [TournamentsController, MatchesController],
  providers: [TournamentsService],
})
export class TournamentsModule {}
