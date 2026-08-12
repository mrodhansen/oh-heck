import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { LiveService } from './live.service';
import {
  ClaimLiveDto,
  CreateLiveDto,
  JoinLiveDto,
  LiveBidDto,
  LivePlayDto,
  LiveTokenDto,
} from './dto';
import { AuthGuard, CurrentUser, OptionalAuth } from '../auth/auth.decorators';
import type { PublicUser } from '../auth/auth.service';

@Controller('live')
export class LiveController {
  constructor(private readonly live: LiveService) {}

  @Post()
  @UseGuards(AuthGuard)
  @OptionalAuth()
  create(@Body() dto: CreateLiveDto, @CurrentUser() user: PublicUser | null) {
    return this.live.create(dto.name, user?.id ?? dto.userId);
  }

  @Post('join')
  @UseGuards(AuthGuard)
  @OptionalAuth()
  join(@Body() dto: JoinLiveDto, @CurrentUser() user: PublicUser | null) {
    return this.live.join(dto.code, dto.name, user?.id ?? dto.userId);
  }

  @Post('claim')
  @UseGuards(AuthGuard)
  @OptionalAuth()
  claim(@Body() dto: ClaimLiveDto, @CurrentUser() user: PublicUser | null) {
    return this.live.claim(dto.code, dto.playerId, user?.id);
  }

  @Get('code/:code')
  lookup(@Param('code') code: string) {
    return this.live.lookupCode(code);
  }

  @Get(':id')
  get(
    @Param('id') id: string,
    @Headers('x-live-token') tokenHeader?: string,
  ) {
    const token = tokenHeader || '';
    return this.live.getView(id, token);
  }

  @Post(':id/start')
  start(@Param('id') id: string, @Body() dto: LiveTokenDto) {
    return this.live.start(id, dto.token);
  }

  @Post(':id/leave')
  leave(@Param('id') id: string, @Body() dto: LiveTokenDto) {
    return this.live.leave(id, dto.token);
  }

  @Post(':id/bid')
  bid(@Param('id') id: string, @Body() dto: LiveBidDto) {
    return this.live.bid(id, dto.token, dto.bid, dto.forceBurn);
  }

  @Post(':id/play')
  play(@Param('id') id: string, @Body() dto: LivePlayDto) {
    return this.live.play(id, dto.token, dto.card);
  }
}
