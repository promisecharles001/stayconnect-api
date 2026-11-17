import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

/**
 * POST /auth/register is public. Whatever roles this DTO accepts are roles
 * anyone on the internet can give themselves — it used to accept ADMIN.
 */
describe('RegisterDto role', () => {
  const base = {
    email: 'new.user@example.com',
    password: 'Str0ng!Passw0rd',
    firstName: 'Ada',
    lastName: 'Obi',
    phone: '+2348012345678',
  };

  const roleErrors = async (role: unknown) => {
    const dto = plainToInstance(RegisterDto, { ...base, role });
    const errors = await validate(dto);
    return errors.filter((e) => e.property === 'role');
  };

  it('refuses ADMIN', async () => {
    expect(await roleErrors('ADMIN')).toHaveLength(1);
  });

  it.each(['HOST', 'VISITOR'])('accepts %s, which the app sends at sign-up', async (role) => {
    expect(await roleErrors(role)).toHaveLength(0);
  });

  it('accepts no role at all (defaults to VISITOR in the service)', async () => {
    expect(await roleErrors(undefined)).toHaveLength(0);
  });
});
