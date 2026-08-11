import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { RulesModule } from './rules/rules.module';
import { GamesModule } from './games/games.module';
import { StatsModule } from './stats/stats.module';
import { RealtimeModule } from './realtime/realtime.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { LiveModule } from './live/live.module';

@Module({
  imports: [
    PrismaModule,
    RulesModule,
    RealtimeModule,
    GamesModule,
    StatsModule,
    TournamentsModule,
    LiveModule,
  ],
})
export class AppModule {}
