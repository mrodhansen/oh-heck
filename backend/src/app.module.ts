import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { RulesModule } from './rules/rules.module';
import { GamesModule } from './games/games.module';
import { StatsModule } from './stats/stats.module';

@Module({
  imports: [PrismaModule, RulesModule, GamesModule, StatsModule],
})
export class AppModule {}
