import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { GamesService } from './games.service';
import {
  CreateGameDto,
  SetBidsDto,
  SetTricksDto,
  SyncDto,
  UpdateRoundDto,
} from './dto';

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
  create(@Body() dto: CreateGameDto) {
    return this.games.createGame(dto);
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

  @Patch(':id/rounds/:roundNumber')
  updateRound(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roundNumber', ParseIntPipe) roundNumber: number,
    @Body() dto: UpdateRoundDto,
  ) {
    return this.games.updateRound(id, roundNumber, dto);
  }
}
