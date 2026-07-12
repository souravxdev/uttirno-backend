import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';

/**
 * Applies a domain zod schema (src/domain/) to a request body/query.
 * Usage: @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
