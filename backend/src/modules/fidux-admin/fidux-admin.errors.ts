import { HttpException, HttpStatus } from '@nestjs/common';

type ErrorDetails = Record<string, unknown>;

export class FiduxAdminException extends HttpException {
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

export const fiduxAdminError = {
    badRequest(code: string, message: string, details?: ErrorDetails) {
        return new FiduxAdminException(HttpStatus.BAD_REQUEST, code, message, details);
    },
    unauthorized(message = 'Authentication required') {
        return new FiduxAdminException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', message);
    },
    forbidden(code: string, message: string, details?: ErrorDetails) {
        return new FiduxAdminException(HttpStatus.FORBIDDEN, code, message, details);
    },
    notFound(code: string, message: string, details?: ErrorDetails) {
        return new FiduxAdminException(HttpStatus.NOT_FOUND, code, message, details);
    },
    conflict(code: string, message: string, details?: ErrorDetails) {
        return new FiduxAdminException(HttpStatus.CONFLICT, code, message, details);
    },
    internal(code: string, message: string, details?: ErrorDetails) {
        return new FiduxAdminException(HttpStatus.INTERNAL_SERVER_ERROR, code, message, details);
    },
};
