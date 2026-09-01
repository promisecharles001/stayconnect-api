import { Test } from '@nestjs/testing';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../common/services/notification.service';
import { PasswordUtil } from '../common/utils/password.util';
import { USER_SAFE_SELECT } from './users.select';
import { createPrismaMock, PrismaMock } from '../test-support/prisma-mock';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaMock;
  let notifications: { sendPayoutDetailsChangedEmail: jest.Mock };

  const newDetails = {
    bankName: 'Guaranty Trust Bank',
    bankCode: '058',
    accountNumber: '0123456789',
    accountName: 'A Host',
    password: 'correct-password',
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    notifications = { sendPayoutDetailsChangedEmail: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationService, useValue: notifications },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  /**
   * Payout details decide where a host's money is sent, which makes them the
   * thing worth changing if you get hold of someone's session. Hence a
   * password on the way in and an email on the way out.
   */
  describe('updatePayoutDetails', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'host-1',
        email: 'host@example.com',
        firstName: 'A',
        password: 'hashed',
        payoutAccountNumber: '9999999999',
      });
      prisma.user.update.mockResolvedValue({
        payoutBankName: newDetails.bankName,
        payoutBankCode: newDetails.bankCode,
        payoutAccountNumber: newDetails.accountNumber,
        payoutAccountName: newDetails.accountName,
        payoutUpdatedAt: new Date(),
      });
    });

    it('rejects a wrong password and changes nothing', async () => {
      jest.spyOn(PasswordUtil, 'compare').mockResolvedValue(false);

      await expect(service.updatePayoutDetails('host-1', newDetails as any)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(notifications.sendPayoutDetailsChangedEmail).not.toHaveBeenCalled();
    });

    it('saves the details when the password is right', async () => {
      jest.spyOn(PasswordUtil, 'compare').mockResolvedValue(true);

      await service.updatePayoutDetails('host-1', newDetails as any);

      const { data } = prisma.user.update.mock.calls[0][0];
      expect(data.payoutAccountNumber).toBe('0123456789');
      expect(data.payoutUpdatedAt).toBeInstanceOf(Date);
    });

    it('emails the owner, showing only the last four digits', async () => {
      jest.spyOn(PasswordUtil, 'compare').mockResolvedValue(true);

      await service.updatePayoutDetails('host-1', newDetails as any);

      const [, , , masked] = notifications.sendPayoutDetailsChangedEmail.mock.calls[0];
      // If someone else made this change, the email is how the owner finds
      // out — but it must not hand over the account it now points at.
      expect(masked).toBe('••••6789');
      expect(masked).not.toContain('0123456789');
    });

    it('still saves if the notification email fails', async () => {
      jest.spyOn(PasswordUtil, 'compare').mockResolvedValue(true);
      notifications.sendPayoutDetailsChangedEmail.mockRejectedValue(new Error('smtp down'));

      await expect(
        service.updatePayoutDetails('host-1', newDetails as any),
      ).resolves.toBeDefined();
    });
  });

  describe('remove', () => {
    it('refuses to delete an account carrying financial history', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'host-1', email: 'host@example.com' });
      prisma.booking.count.mockResolvedValue(4);
      prisma.withdrawalRequest.count.mockResolvedValue(1);
      prisma.earningsLedger.count.mockResolvedValue(2);

      // Deleting used to surface as a 500 carrying the raw Prisma error.
      await expect(service.remove('host-1')).rejects.toThrow(ConflictException);
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('deletes an account with no history', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'nobody@example.com' });
      prisma.booking.count.mockResolvedValue(0);
      prisma.withdrawalRequest.count.mockResolvedValue(0);
      prisma.earningsLedger.count.mockResolvedValue(0);

      await service.remove('user-1');

      expect(prisma.user.delete).toHaveBeenCalled();
    });
  });

  describe('USER_SAFE_SELECT', () => {
    it('excludes secrets and payout details', () => {
      // An allowlist rather than a denylist, so anything sensitive added to
      // the schema later stays out of responses by default. Password hashes
      // did once go out over the wire on the admin user list.
      for (const field of [
        'password',
        'passwordResetTokenHash',
        'payoutAccountNumber',
        'payoutBankName',
        'payoutAccountName',
      ]) {
        expect(USER_SAFE_SELECT).not.toHaveProperty(field);
      }
    });
  });
});
