import { Transform } from 'class-transformer';
import {
  IsEmail,
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
  @MaxLength(50)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastName!: string;

  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}

export class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(254)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}

export class UpdateAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}

export class ClaimPlayerDto {
  @IsUUID()
  playerId!: string;
}
