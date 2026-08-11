import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import {
  AddTournamentPlayerDto,
  CreateTournamentDto,
  SetTableDealerDto,
} from './dto';

@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly tournaments: TournamentsService) {}

  @Get()
  list(@Query('all') all?: string) {
    if (all === '1' || all === 'true') {
      return this.tournaments.listAll();
    }
    return this.tournaments.listOpen();
  }

  @Post()
  create(@Body() dto: CreateTournamentDto) {
    return this.tournaments.create(dto);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.tournaments.get(id);
  }

  @Post(':id/players')
  addPlayer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddTournamentPlayerDto,
  ) {
    return this.tournaments.addPlayer(id, dto);
  }

  @Delete(':id/players/:playerId')
  removePlayer(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('playerId', ParseUUIDPipe) playerId: string,
  ) {
    return this.tournaments.removePlayer(id, playerId);
  }

  @Post(':id/seat')
  seat(@Param('id', ParseUUIDPipe) id: string) {
    return this.tournaments.seatTables(id);
  }

  @Post(':id/tables/:tableId/dealer')
  setDealer(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tableId', ParseUUIDPipe) tableId: string,
    @Body() dto: SetTableDealerDto,
  ) {
    return this.tournaments.setTableDealer(id, tableId, dto);
  }

  @Post(':id/tables/:tableId/start')
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tableId', ParseUUIDPipe) tableId: string,
  ) {
    return this.tournaments.startTableGame(id, tableId);
  }
}
