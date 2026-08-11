import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
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

@Controller('live')
export class LiveController {
  constructor(private readonly live: LiveService) {}

  @Post()
  create(@Body() dto: CreateLiveDto) {
    return this.live.create(dto.name);
  }

  @Post('join')
  join(@Body() dto: JoinLiveDto) {
    return this.live.join(dto.code, dto.name);
  }

  @Post('claim')
  claim(@Body() dto: ClaimLiveDto) {
    return this.live.claim(dto.code, dto.playerId);
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
