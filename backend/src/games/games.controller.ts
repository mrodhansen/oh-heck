import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { GamesService } from './games.service';
import {
  ClaimSeatDto,
  CreateGameDto,
  SetBidsDto,
  SetSuperPlayDto,
  SetTricksDto,
  SyncDto,
  UpdateNotesDto,
  UpdateRoundDto,
} from './dto';
import { AuthGuard, CurrentUser, OptionalAuth } from '../auth/auth.decorators';
import type { PublicUser } from '../auth/auth.service';

@Controller('games')
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Get()
  list() {
    return this.games.listGames();
  }

  @Post('sync')
  sync(@Body() dto: SyncDto) {
    return this.games.syncOperations(dto.operations);
  }

  @Post()
  @UseGuards(AuthGuard)
  @OptionalAuth()
  create(@Body() dto: CreateGameDto, @CurrentUser() user: PublicUser | null) {
    return this.games.createGame(dto, { actorUserId: user?.id });
  }

  @Post(':id/claim')
  @UseGuards(AuthGuard)
  claim(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClaimSeatDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.games.claimPlayer(id, dto.playerId, user.id);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.games.getGame(id);
  }

  @Post(':id/rounds/:roundNumber/bids')
  setBids(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roundNumber', ParseIntPipe) roundNumber: number,
    @Body() dto: SetBidsDto,
  ) {
    return this.games.setBids(id, roundNumber, dto);
  }

  @Post(':id/rounds/:roundNumber/tricks')
  setTricks(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roundNumber', ParseIntPipe) roundNumber: number,
    @Body() dto: SetTricksDto,
  ) {
    return this.games.setTricks(id, roundNumber, dto);
  }

  @Post(':id/rounds/:roundNumber/super-play')
  setSuperPlay(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roundNumber', ParseIntPipe) roundNumber: number,
    @Body() dto: SetSuperPlayDto,
  ) {
    return this.games.setSuperPlay(id, roundNumber, dto);
  }

  @Patch(':id/notes')
  updateNotes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNotesDto,
  ) {
    return this.games.updateNotes(id, dto);
  }

  @Patch(':id/rounds/:roundNumber')
  updateRound(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roundNumber', ParseIntPipe) roundNumber: number,
    @Body() dto: UpdateRoundDto,
  ) {
    return this.games.updateRound(id, roundNumber, dto);
  }
}
