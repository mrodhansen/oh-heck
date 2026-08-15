import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { RulesModule } from './rules/rules.module';
import { GamesModule } from './games/games.module';
import { StatsModule } from './stats/stats.module';
import { RealtimeModule } from './realtime/realtime.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { LiveModule } from './live/live.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  imports: [
    PrismaModule,
    RulesModule,
    RealtimeModule,
    AuthModule,
    GamesModule,
    StatsModule,
    TournamentsModule,
    LiveModule,
  ],
})
export class AppModule {}
