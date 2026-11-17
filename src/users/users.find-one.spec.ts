import { Test } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../common/services/notification.service';
import { USER_PUBLIC_SELECT, USER_SAFE_SELECT } from './users.select';
import { createPrismaMock, PrismaMock } from '../test-support/prisma-mock';

/**
 * Host ids are public (every listing carries one), so GET /users/:id must not
 * hand a stranger the host's phone or email — that bypassed "host contact
 * stays hidden until payment is verified".
 */
describe('UsersService.findOne', () => {
  let service: UsersService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = createPrismaMock();
    prisma.user.findUnique.mockResolvedValue({ id: 'host-1', firstName: 'Host' });

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  const selectUsed = () => prisma.user.findUnique.mock.calls[0][0].select;

  it('gives another signed-in user the public profile only', async () => {
    await service.findOne('host-1', { id: 'visitor-1', roleName: 'VISITOR' });
    expect(selectUsed()).toBe(USER_PUBLIC_SELECT);
  });

  it('never includes email, phone or push token in the public profile', () => {
    expect(USER_PUBLIC_SELECT).not.toHaveProperty('email');
    expect(USER_PUBLIC_SELECT).not.toHaveProperty('phone');
    expect(USER_PUBLIC_SELECT).not.toHaveProperty('pushToken');
  });

  it('gives the user their own full profile', async () => {
    await service.findOne('host-1', { id: 'host-1', roleName: 'HOST' });
    expect(selectUsed()).toBe(USER_SAFE_SELECT);
  });

  it('gives an admin the full profile', async () => {
    await service.findOne('host-1', { id: 'admin-1', roleName: 'ADMIN' });
    expect(selectUsed()).toBe(USER_SAFE_SELECT);
  });
});
