import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePropertyDto } from './update-property.dto';

// The global pipe in main.ts runs with enableImplicitConversion, which is what
// makes booleans dangerous here: it coerces by truthiness, so the string
// "false" arrives as `true`. These tests run with the same option so they
// exercise the real behaviour rather than a friendlier default.
const TRANSFORM_OPTS = { enableImplicitConversion: true };

async function coerce(raw: Record<string, unknown>) {
  const dto = plainToInstance(UpdatePropertyDto, raw, TRANSFORM_OPTS);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return {
    value: (dto as Record<string, unknown>).isInstantBook,
    rejected: errors.some((e) => e.property === 'isInstantBook'),
  };
}

describe('isInstantBook coercion', () => {
  it('keeps the string "false" false', async () => {
    // Before the @Transform this became `true`, turning instant-book ON for a
    // host who had just switched it off.
    await expect(coerce({ isInstantBook: 'false' })).resolves.toEqual({
      value: false,
      rejected: false,
    });
  });

  it('keeps the string "true" true', async () => {
    await expect(coerce({ isInstantBook: 'true' })).resolves.toEqual({
      value: true,
      rejected: false,
    });
  });

  it('passes real booleans through unchanged', async () => {
    await expect(coerce({ isInstantBook: false })).resolves.toEqual({
      value: false,
      rejected: false,
    });
    await expect(coerce({ isInstantBook: true })).resolves.toEqual({
      value: true,
      rejected: false,
    });
  });

  it('leaves the field alone when absent, since this DTO is a partial', async () => {
    await expect(coerce({})).resolves.toEqual({
      value: undefined,
      rejected: false,
    });
  });

  it('rejects values that are not booleans instead of guessing', async () => {
    // There was no @IsBoolean at all before, so these were stored as-is.
    await expect(coerce({ isInstantBook: 'yes' })).resolves.toMatchObject({
      rejected: true,
    });
    await expect(coerce({ isInstantBook: 7 })).resolves.toMatchObject({
      rejected: true,
    });
  });
});
