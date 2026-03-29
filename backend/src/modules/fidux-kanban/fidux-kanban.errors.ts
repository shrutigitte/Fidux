import { HttpException, HttpStatus } from '@nestjs/common';

type ErrorDetails = Record<string, unknown>;

type ConflictCurrentIssue = {
    id: string;
    status: string;
    version: number;
};

export class FiduxKanbanException extends HttpException {
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

export class FiduxVersionConflictException extends HttpException {
    constructor(message: string, current: ConflictCurrentIssue) {
        super(
            {
                error: {
                    code: 'VERSION_CONFLICT',
                    message,
                },
                current,
            },
            HttpStatus.CONFLICT,
        );
    }
}

export const fiduxKanbanError = {
    unauthorized(message = 'Unauthorized') {
        return new FiduxKanbanException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', message);
    },
    forbidden(code: string, message: string, details?: ErrorDetails) {
        return new FiduxKanbanException(HttpStatus.FORBIDDEN, code, message, details);
    },
    badRequest(code: string, message: string, details?: ErrorDetails) {
        return new FiduxKanbanException(HttpStatus.BAD_REQUEST, code, message, details);
    },
    notFound(code: string, message: string, details?: ErrorDetails) {
        return new FiduxKanbanException(HttpStatus.NOT_FOUND, code, message, details);
    },
    conflict(code: string, message: string, details?: ErrorDetails) {
        return new FiduxKanbanException(HttpStatus.CONFLICT, code, message, details);
    },
    versionConflict(message: string, current: ConflictCurrentIssue) {
        return new FiduxVersionConflictException(message, current);
    },
    internal(code: string, message: string, details?: ErrorDetails) {
        return new FiduxKanbanException(HttpStatus.INTERNAL_SERVER_ERROR, code, message, details);
    },
};
