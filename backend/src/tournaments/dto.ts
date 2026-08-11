import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTournamentDto {
  @IsInt()
  @Min(2)
  @Max(49)
  targetPlayerCount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsUUID()
  id?: string;
}

export class AddTournamentPlayerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  @IsOptional()
  @IsUUID()
  id?: string;
}

export class SetTableDealerDto {
  @IsUUID()
  tournamentPlayerId!: string;
}

export class SeatPlanSeatDto {
  @IsUUID()
  id!: string;

  @IsUUID()
  tournamentPlayerId!: string;

  @IsInt()
  @Min(0)
  @Max(6)
  seatIndex!: number;
}

export class SeatPlanTableDto {
  @IsUUID()
  id!: string;

  @IsInt()
  @Min(1)
  @Max(25)
  tableNumber!: number;

  @IsInt()
  @Min(0)
  @Max(6)
  dealerSeat!: number;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => SeatPlanSeatDto)
  seats!: SeatPlanSeatDto[];
}

export class SeatTournamentDto {
  /** Client-authored seating plan for offline-first seating. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => SeatPlanTableDto)
  tables?: SeatPlanTableDto[];
}

export class StartTournamentTableDto {
  @IsOptional()
  @IsUUID()
  gameId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(7)
  @IsUUID('4', { each: true })
  playerIds?: string[];
}

export class TournamentSyncOperationDto {
  @IsIn([
    'createTournament',
    'addTournamentPlayer',
    'removeTournamentPlayer',
    'seatTournament',
    'startTournamentTable',
  ])
  type!:
    | 'createTournament'
    | 'addTournamentPlayer'
    | 'removeTournamentPlayer'
    | 'seatTournament'
    | 'startTournamentTable';

  @IsObject()
  payload!: Record<string, unknown>;
}

export class TournamentSyncDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TournamentSyncOperationDto)
  operations!: TournamentSyncOperationDto[];
}
