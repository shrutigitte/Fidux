import { ValidationError, ValidationPipe } from '@nestjs/common';

import { pluginError } from './plugin.errors';

export const pluginValidationPipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidUnknownValues: false,
    exceptionFactory: (errors: ValidationError[]) => {
        const details = errors.map((error) => ({
            field: error.property,
            constraints: error.constraints ?? {},
        }));

        return pluginError.badRequest('VALIDATION_ERROR', 'Invalid payload', { details });
    },
});

export const pluginQueryValidationPipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    exceptionFactory: (errors: ValidationError[]) => {
        const details = errors.map((error) => ({
            field: error.property,
            constraints: error.constraints ?? {},
        }));

        return pluginError.badRequest('VALIDATION_ERROR', 'Invalid query parameters', { details });
    },
});
