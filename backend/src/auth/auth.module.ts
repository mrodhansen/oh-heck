import { Global, Module } from '@nestjs/common';
import { StatsModule } from '../stats/stats.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.decorators';
import { AuthService } from './auth.service';

@Global()
@Module({
  imports: [StatsModule],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
