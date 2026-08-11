import { Module, forwardRef } from '@nestjs/common';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

@Module({
  imports: [forwardRef(() => TournamentsModule)],
  controllers: [GamesController],
  providers: [GamesService],
  exports: [GamesService],
})
export class GamesModule {}

