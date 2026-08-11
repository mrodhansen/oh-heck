import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

export class CreateGameDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(7)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(40, { each: true })
  playerNames!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  /** Client-generated id for offline-first sync */
  @IsOptional()
  @IsUUID()
  id?: string;

  /** Client-generated player ids, same order/length as playerNames */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(7)
  @IsUUID('4', { each: true })
  playerIds?: string[];
}

export class SyncOperationDto {
  @IsIn(['createGame', 'setBids', 'setTricks', 'updateRound'])
  type!: 'createGame' | 'setBids' | 'setTricks' | 'updateRound';

  @IsObject()
  payload!: Record<string, unknown>;
}

export class SyncDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SyncOperationDto)
  operations!: SyncOperationDto[];
}

export class BidItemDto {
  @IsUUID()
  playerId!: string;

  @IsInt()
  @Min(0)
  @Max(7)
  bid!: number;
}

export class SetBidsDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => BidItemDto)
  bids!: BidItemDto[];

  @IsOptional()
  @IsBoolean()
  forceBurn?: boolean;
}

export class TrickItemDto {
  @IsUUID()
  playerId!: string;

  @IsInt()
  @Min(0)
  @Max(7)
  tricksTaken!: number;
}

export class SetTricksDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => TrickItemDto)
  tricks!: TrickItemDto[];
}

export class UpdateRoundDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => BidItemDto)
  bids!: BidItemDto[];

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => TrickItemDto)
  tricks!: TrickItemDto[];

  @IsOptional()
  @IsBoolean()
  forceBurn?: boolean;
}
