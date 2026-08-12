import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateLiveDto {
  @IsString()
  @MinLength(1)
  @MaxLength(24)
  name!: string;

  /** When set with a valid session, links the host seat to this account */
  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class JoinLiveDto {
  @IsString()
  @MinLength(4)
  @MaxLength(4)
  @Matches(/^\d{4}$/)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(24)
  name!: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class ClaimLiveDto {
  @IsString()
  @MinLength(4)
  @MaxLength(4)
  @Matches(/^\d{4}$/)
  code!: string;

  @IsUUID()
  playerId!: string;
}

export class LiveTokenDto {
  @IsString()
  @MinLength(8)
  token!: string;
}

export class LiveBidDto {
  @IsString()
  @MinLength(8)
  token!: string;

  @IsInt()
  bid!: number;

  @IsOptional()
  @IsBoolean()
  forceBurn?: boolean;
}

export class LivePlayDto {
  @IsString()
  @MinLength(8)
  token!: string;

  @IsString()
  @Matches(/^[2-9TJQKA][CDHS]$/)
  card!: string;
}
