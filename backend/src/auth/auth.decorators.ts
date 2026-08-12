import {
  createParamDecorator,
  ExecutionContext,
  Injectable,
  CanActivate,
  UnauthorizedException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService, type PublicUser } from './auth.service';
import { readAuthToken } from './cookies';

export type AuthedRequest = Request & { user?: PublicUser | null };

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PublicUser | null => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    return req.user ?? null;
  },
);

export const OPTIONAL_AUTH = 'optionalAuth';
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH, true);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const optional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = readAuthToken(req);
    const user = await this.auth.userFromToken(token);
    req.user = user;
    if (optional) return true;
    if (!user) {
      throw new UnauthorizedException('Sign in required');
    }
    return true;
  }
}
