import { Module } from '@nestjs/common';
import { GamesModule } from '../games/games.module';
import { LiveController } from './live.controller';
import { LiveService } from './live.service';
import { LIVE_SERVICE } from './live.tokens';

@Module({
  imports: [GamesModule],
  controllers: [LiveController],
  providers: [
    LiveService,
    { provide: LIVE_SERVICE, useExisting: LiveService },
  ],
  exports: [LiveService, LIVE_SERVICE],
})
export class LiveModule {}
