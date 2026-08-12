import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { mapException } from './api-error';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const body = mapException(exception);

    const line = `${req.method} ${req.url} ${body.statusCode} ${body.code}: ${body.message}`;
    if (body.statusCode >= 500) {
      this.logger.error(
        line,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(line);
    }

    res.status(body.statusCode).json(body);
  }
}
