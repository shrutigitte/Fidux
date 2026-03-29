import { HttpException, HttpStatus } from '@nestjs/common';

type ErrorDetails = Record<string, unknown>;

export class PluginApiException extends HttpException {
    constructor(status: HttpStatus, code: string, message: string, details?: ErrorDetails) {
        super(
            {
                error: {
                    code,
                    message,
                    ...(details ? { details } : {}),
                },
            },
            status,
        );
    }
}

export const pluginError = {
    unauthorized(message = 'Invalid or expired PAT') {
        return new PluginApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', message);
    },
    forbidden(code: string, message: string, details?: ErrorDetails) {
        return new PluginApiException(HttpStatus.FORBIDDEN, code, message, details);
    },
    badRequest(code: string, message: string, details?: ErrorDetails) {
        return new PluginApiException(HttpStatus.BAD_REQUEST, code, message, details);
    },
    conflict(code: string, message: string, details?: ErrorDetails) {
        return new PluginApiException(HttpStatus.CONFLICT, code, message, details);
    },
    tooManyRequests(code: string, message: string, details?: ErrorDetails) {
        return new PluginApiException(HttpStatus.TOO_MANY_REQUESTS, code, message, details);
    },
    notFound(code: string, message: string, details?: ErrorDetails) {
        return new PluginApiException(HttpStatus.NOT_FOUND, code, message, details);
    },
    internal(code: string, message: string, details?: ErrorDetails) {
        return new PluginApiException(HttpStatus.INTERNAL_SERVER_ERROR, code, message, details);
    },
};
