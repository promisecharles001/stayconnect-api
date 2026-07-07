import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User, Role } from '@prisma/client';

// Type for the user object returned by JWT strategy
type AuthenticatedUser = Omit<User, 'role'> & { role: Role };

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
