import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  ClaimPlayerDto,
  LoginDto,
  RegisterDto,
  UpdateAccountDto,
} from './dto';
import { AuthGuard, CurrentUser, OptionalAuth } from './auth.decorators';
import type { PublicUser } from './auth.service';
import {
  clearSessionCookie,
  readAuthToken,
  setSessionCookie,
} from './cookies';
import { StatsService } from '../stats/stats.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly stats: StatsService,
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.auth.register(dto);
    setSessionCookie(res, token);
    return { user, token };
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.auth.login(dto);
    setSessionCookie(res, token);
    return { user, token };
  }

  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(readAuthToken(req));
    clearSessionCookie(res);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @OptionalAuth()
  me(@CurrentUser() user: PublicUser | null) {
    return { user };
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  updateMe(@CurrentUser() user: PublicUser, @Body() dto: UpdateAccountDto) {
    return this.auth.updateAccount(user.id, dto).then((u) => ({ user: u }));
  }

  @Get('me/stats')
  @UseGuards(AuthGuard)
  async myStats(@CurrentUser() user: PublicUser) {
    const all = await this.stats.getStats();
    const mine = all.players.find((p) => p.userId === user.id) ?? null;
    return { user, stats: mine };
  }

  @Get('me/claimable')
  @UseGuards(AuthGuard)
  claimable(@CurrentUser() user: PublicUser) {
    return this.auth.listClaimableGames(user.id, user.username);
  }

  @Post('games/:gameId/claim')
  @UseGuards(AuthGuard)
  claim(
    @CurrentUser() user: PublicUser,
    @Param('gameId', ParseUUIDPipe) gameId: string,
    @Body() dto: ClaimPlayerDto,
  ) {
    return this.auth.claimGamePlayer(user.id, gameId, dto.playerId);
  }
}
