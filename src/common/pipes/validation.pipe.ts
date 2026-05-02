import { ValidationPipe as NestValidationPipe, ValidationError } from '@nestjs/common';

export const createValidationPipe = () => {
  return new NestValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
    exceptionFactory: (errors: ValidationError[]) => {
      const formatErrors = (errors: ValidationError[], parentPath = ''): string[] => {
        const messages: string[] = [];

        errors.forEach((error) => {
          const currentPath = parentPath 
            ? `${parentPath}.${error.property}` 
            : error.property;

          if (error.constraints) {
            messages.push(...Object.values(error.constraints).map(msg => `${currentPath}: ${msg}`));
          }

          if (error.children && error.children.length > 0) {
            messages.push(...formatErrors(error.children, currentPath));
          }
        });

        return messages;
      };

      const formattedErrors = formatErrors(errors);
      
      return new (require('@nestjs/common').BadRequestException)({
        message: 'Validation failed',
        error: 'Bad Request',
        details: formattedErrors,
      });
    },
  });
};
