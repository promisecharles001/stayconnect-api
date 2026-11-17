import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WithdrawalsService } from './withdrawals.service';
import { PrismaService } from '../prisma/prisma.service';
import { EarningsService } from '../earnings/earnings.service';
import { PushNotificationService } from '../common/services/push-notification.service';
import { createPrismaMock, PrismaMock } from '../test-support/prisma-mock';

/**
 * A withdrawal holds the host's bank account number and name. Any signed-in
 * user with the id used to be able to read it.
 */
describe('WithdrawalsService.findOne', () => {
  let service: WithdrawalsService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = createPrismaMock();
    prisma.withdrawalRequest.findUnique.mockResolvedValue({
      id: 'w-1',
      hostId: 'host-1',
      amount: 10000,
      accountNumber: '0123456789',
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        WithdrawalsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EarningsService, useValue: {} },
        { provide: PushNotificationService, useValue: { sendToUser: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(WithdrawalsService);
  });

  it('refuses another user with the same 404 as a missing id', async () => {
    await expect(
      service.findOne('w-1', { id: 'someone-else', roleName: 'HOST' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('shows the host their own withdrawal', async () => {
    const result = await service.findOne('w-1', { id: 'host-1', roleName: 'HOST' });
    expect(result.id).toBe('w-1');
  });

  it('shows an admin any withdrawal', async () => {
    const result = await service.findOne('w-1', { id: 'admin-1', roleName: 'ADMIN' });
    expect(result.id).toBe('w-1');
  });
});
