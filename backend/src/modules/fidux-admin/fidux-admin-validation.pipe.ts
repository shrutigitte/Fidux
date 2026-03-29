import { ValidationError, ValidationPipe } from '@nestjs/common';

import { fiduxAdminError } from './fidux-admin.errors';

export const fiduxAdminValidationPipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    exceptionFactory: (errors: ValidationError[]) => {
        const details = errors.map((error) => ({
            field: error.property,
            constraints: error.constraints ?? {},
        }));

        return fiduxAdminError.badRequest('VALIDATION_ERROR', 'Invalid payload', {
            details,
        });
    },
});
