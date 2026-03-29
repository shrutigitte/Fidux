import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class FiduxAdminExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(FiduxAdminExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();

        if (exception instanceof HttpException) {
            const status = exception.getStatus();
            const payload = exception.getResponse();

            if (
                payload &&
                typeof payload === 'object' &&
                'error' in payload &&
                typeof (payload as { error?: unknown }).error === 'object'
            ) {
                response.status(status).json(payload);
                return;
            }

            const message = this.resolveMessage(payload, exception.message);
            response.status(status).json({
                error: {
                    code: this.codeFromStatus(status),
                    message,
                },
            });
            return;
        }

        this.logger.error('Unhandled Fidux admin exception', exception as Error);
        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Unexpected admin error',
            },
        });
    }

    private codeFromStatus(status: number) {
        switch (status) {
            case HttpStatus.BAD_REQUEST:
                return 'VALIDATION_ERROR';
            case HttpStatus.UNAUTHORIZED:
                return 'UNAUTHORIZED';
            case HttpStatus.FORBIDDEN:
                return 'FORBIDDEN';
            case HttpStatus.NOT_FOUND:
                return 'NOT_FOUND';
            case HttpStatus.CONFLICT:
                return 'CONFLICT';
            default:
                return 'INTERNAL_ERROR';
        }
    }

    private resolveMessage(payload: unknown, fallback: string) {
        if (typeof payload === 'string') {
            return payload;
        }

        if (payload && typeof payload === 'object') {
            const message = (payload as { message?: unknown }).message;
            if (typeof message === 'string') {
                return message;
            }
            if (Array.isArray(message) && typeof message[0] === 'string') {
                return message[0];
            }
        }

        return fallback;
    }
}
