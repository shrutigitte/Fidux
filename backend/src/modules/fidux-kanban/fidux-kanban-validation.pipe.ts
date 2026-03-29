import { ValidationError, ValidationPipe } from '@nestjs/common';

import { fiduxKanbanError } from './fidux-kanban.errors';

function mapValidationErrors(errors: ValidationError[]) {
    return errors.map((error) => ({
        field: error.property,
        constraints: error.constraints ?? {},
    }));
}

export const fiduxKanbanValidationPipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidUnknownValues: false,
    exceptionFactory: (errors: ValidationError[]) =>
        fiduxKanbanError.badRequest('VALIDATION_ERROR', 'Invalid payload', {
            details: mapValidationErrors(errors),
        }),
});

export const fiduxKanbanQueryValidationPipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    exceptionFactory: (errors: ValidationError[]) =>
        fiduxKanbanError.badRequest('VALIDATION_ERROR', 'Invalid query parameters', {
            details: mapValidationErrors(errors),
        }),
});
