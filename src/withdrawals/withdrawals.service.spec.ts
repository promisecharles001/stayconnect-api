import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { WithdrawalsService } from './withdrawals.service';
import { PrismaService } from '../prisma/prisma.service';
import { EarningsService } from '../earnings/earnings.service';
import { PushNotificationService } from '../common/services/push-notification.service';
import { createPrismaMock, PrismaMock } from '../test-support/prisma-mock';

/**
 * A withdrawal is money leaving the platform, and the balance is deducted the
 * moment one is requested. The guards here are what stop a host draining more
 * than they have earned, or queueing several payouts against one balance.
 */
describe('WithdrawalsService', () => {
  let service: WithdrawalsService;
  let prisma: PrismaMock;
  let earnings: { getEarningsSummary: jest.Mock; deductForWithdrawal: jest.Mock; refundWithdrawal: jest.Mock };

  const validRequest = {
    amount: 10000,
    bankName: 'Guaranty Trust Bank',
    bankCode: '058',
    accountNumber: '0123456789',
    accountName: 'A Host',
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    earnings = {
      getEarningsSummary: jest.fn().mockResolvedValue({ availableBalance: 50000 }),
      deductForWithdrawal: jest.fn().mockResolvedValue({}),
      refundWithdrawal: jest.fn().mockResolvedValue({}),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WithdrawalsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EarningsService, useValue: earnings },
        { provide: PushNotificationService, useValue: { sendToUser: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(WithdrawalsService);
  });

  describe('create', () => {
    beforeEach(() => {
      prisma.withdrawalRequest.count.mockResolvedValue(0);
      prisma.withdrawalRequest.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'w-1', ...data }),
      );
    });

    it('deducts the amount from the host balance straight away', async () => {
      await service.create('host-1', validRequest as any);

      // Deducting on request, not on payout, is what stops the same balance
      // being spent twice while an admin is still processing the first one.
      expect(earnings.deductForWithdrawal).toHaveBeenCalledWith('host-1', 10000, 'w-1');
    });

    it('refuses more than the available balance', async () => {
      earnings.getEarningsSummary.mockResolvedValue({ availableBalance: 5000 });

      await expect(service.create('host-1', validRequest as any)).rejects.toThrow(
        /Insufficient/i,
      );
      expect(prisma.withdrawalRequest.create).not.toHaveBeenCalled();
      expect(earnings.deductForWithdrawal).not.toHaveBeenCalled();
    });

    it('refuses an amount under the minimum', async () => {
      await expect(
        service.create('host-1', { ...validRequest, amount: 500 } as any),
      ).rejects.toThrow(BadRequestException);
      expect(earnings.deductForWithdrawal).not.toHaveBeenCalled();
    });

    it('refuses a second request while one is still pending', async () => {
      prisma.withdrawalRequest.count.mockResolvedValue(1);

      await expect(service.create('host-1', validRequest as any)).rejects.toThrow(
        /already have a pending/i,
      );
      expect(earnings.deductForWithdrawal).not.toHaveBeenCalled();
    });
  });

  describe('processWithdrawal', () => {
    beforeEach(() => {
      prisma.withdrawalRequest.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'w-1', hostId: 'host-1', amount: 10000, ...data }),
      );
    });

    it('puts the money back when a payout fails', async () => {
      prisma.withdrawalRequest.findUnique.mockResolvedValue({
        id: 'w-1',
        hostId: 'host-1',
        amount: 10000,
        status: 'PENDING',
      });

      await service.processWithdrawal('w-1', 'admin-1', 'FAILED' as any, undefined, 'bad account');

      // The balance was already debited at request time, so a failed transfer
      // that didn't credit it back would simply lose the host their money.
      expect(earnings.refundWithdrawal).toHaveBeenCalledWith('host-1', 10000, 'w-1');
    });

    it('does not credit anything back on a completed payout', async () => {
      prisma.withdrawalRequest.findUnique.mockResolvedValue({
        id: 'w-1',
        hostId: 'host-1',
        amount: 10000,
        status: 'PENDING',
      });

      await service.processWithdrawal('w-1', 'admin-1', 'COMPLETED' as any, 'TRF-123');

      expect(earnings.refundWithdrawal).not.toHaveBeenCalled();
    });

    it('refuses to pay a request that is already completed', async () => {
      prisma.withdrawalRequest.findUnique.mockResolvedValue({
        id: 'w-1',
        hostId: 'host-1',
        amount: 10000,
        status: 'COMPLETED',
      });

      // Without this, paying the same request twice is one double-click away.
      await expect(
        service.processWithdrawal('w-1', 'admin-1', 'COMPLETED' as any),
      ).rejects.toThrow(/already .?COMPLETED/i);
    });

    it('allows the two-step payout: approve, then mark paid', async () => {
      // Approving and marking paid both used to send COMPLETED, so the
      // second action always failed with "not pending" and a host could
      // never be recorded as paid.
      prisma.withdrawalRequest.findUnique.mockResolvedValue({
        id: 'w-1',
        hostId: 'host-1',
        amount: 10000,
        status: 'PENDING',
      });
      await expect(
        service.processWithdrawal('w-1', 'admin-1', 'PROCESSING' as any),
      ).resolves.toBeDefined();

      prisma.withdrawalRequest.findUnique.mockResolvedValue({
        id: 'w-1',
        hostId: 'host-1',
        amount: 10000,
        status: 'PROCESSING',
      });
      await expect(
        service.processWithdrawal('w-1', 'admin-1', 'COMPLETED' as any, 'TRF-1'),
      ).resolves.toBeDefined();

      // Neither step credits anything back — the money is on its way out.
      expect(earnings.refundWithdrawal).not.toHaveBeenCalled();
    });

    it('can still fail a withdrawal that is mid-processing', async () => {
      prisma.withdrawalRequest.findUnique.mockResolvedValue({
        id: 'w-1',
        hostId: 'host-1',
        amount: 10000,
        status: 'PROCESSING',
      });

      await service.processWithdrawal('w-1', 'admin-1', 'FAILED' as any, undefined, 'bank rejected');

      // A transfer that bounces after approval must still return the money.
      expect(earnings.refundWithdrawal).toHaveBeenCalledWith('host-1', 10000, 'w-1');
    });
  });
});
