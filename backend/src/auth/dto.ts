import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}

export class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password?: string;
}

export class ClaimPlayerDto {
  @IsUUID()
  playerId!: string;
}
