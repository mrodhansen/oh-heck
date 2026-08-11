import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

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
