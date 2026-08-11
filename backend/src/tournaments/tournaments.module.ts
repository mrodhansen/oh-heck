import { Module, forwardRef } from '@nestjs/common';
import { GamesModule } from '../games/games.module';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';

@Module({
  imports: [forwardRef(() => GamesModule)],
  controllers: [TournamentsController],
  providers: [TournamentsService],
  exports: [TournamentsService],
})
export class TournamentsModule {}
