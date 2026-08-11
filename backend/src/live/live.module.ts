import { Module } from '@nestjs/common';
import { GamesModule } from '../games/games.module';
import { LiveController } from './live.controller';
import { LiveService } from './live.service';

@Module({
  imports: [GamesModule],
  controllers: [LiveController],
  providers: [LiveService],
  exports: [LiveService],
})
export class LiveModule {}
