import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { USER_SAFE_SELECT } from './users.select';
import { PasswordUtil } from '../common/utils/password.util';
import { PaginationUtil, PaginatedResult } from '../common/utils/pagination.util';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UserResponseDto } from './dto/user-response.dto';
import {
  UpdatePayoutDetailsDto,
  PayoutDetailsResponseDto,
} from './dto/payout-details.dto';
import { NotificationService } from '../common/services/notification.service';
import { UserStatus } from '@prisma/client';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    const { email, password, roleId } = createUserDto;

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Validate password strength
    const passwordValidation = PasswordUtil.validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      throw new BadRequestException({
        message: 'Password is too weak',
        details: passwordValidation.errors,
      });
    }

    // Hash password
    const hashedPassword = await PasswordUtil.hash(password);

    // Get role if provided, otherwise default to GUEST
    let userRoleId = roleId;
    if (!userRoleId) {
      const guestRole = await this.prisma.role.findUnique({
        where: { name: 'GUEST' },
      });
      if (!guestRole) {
        throw new NotFoundException('Default role not found');
      }
      userRoleId = guestRole.id;
    }

    // Create user
    const user = await this.prisma.user.create({
      data: {
        ...createUserDto,
        password: hashedPassword,
        roleId: userRoleId,
      },
      select: USER_SAFE_SELECT,
    });

    this.logger.log(`User created by admin: ${user.email}`);

    return user as unknown as UserResponseDto;
  }

  async findAll(query: QueryUsersDto): Promise<PaginatedResult<UserResponseDto>> {
    const { search, status, page, limit } = query;
    const { skip, take } = {
      skip: PaginationUtil.calculateSkip({ page, limit }),
      take: limit,
    };

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
    }

    // Get total count
    const total = await this.prisma.user.count({ where });

    // Get users
    const users = await this.prisma.user.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: USER_SAFE_SELECT,
    });

    return PaginationUtil.createResult(users as unknown as UserResponseDto[], total, { page, limit });
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SAFE_SELECT,
    });

    if (!user) {
      throw new NotFoundException(`User with ID '${id}' not found`);
    }

    return user as unknown as UserResponseDto;
  }

  async findByEmail(email: string): Promise<UserResponseDto | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: USER_SAFE_SELECT,
    });

    return user as unknown as UserResponseDto | null;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new NotFoundException(`User with ID '${id}' not found`);
    }

    // Prepare update data, handling role separately
    const { role, ...updateData } = updateUserDto;
    
    const updatePayload: any = { ...updateData };
    if (role) {
      // Find the role by name to get its ID
      const roleRecord = await this.prisma.role.findUnique({
        where: { name: role },
      });
      if (roleRecord) {
        updatePayload.roleId = roleRecord.id;
      }
    }

    // Update user
    const user = await this.prisma.user.update({
      where: { id },
      data: updatePayload,
      select: USER_SAFE_SELECT,
    });

    this.logger.log(`User updated: ${user.email}`);

    return user as unknown as UserResponseDto;
  }

  async remove(id: string): Promise<void> {
    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new NotFoundException(`User with ID '${id}' not found`);
    }

    // Bookings, earnings and withdrawals deliberately have no cascade to
    // User: they are financial history, and deleting an account should not
    // silently erase the record of money that moved. Postgres therefore
    // refuses the delete, which surfaced as a 500 with the raw Prisma error
    // in the response body. Refuse it deliberately instead, and say what to
    // do about it.
    const [bookings, withdrawals, earnings] = await Promise.all([
      this.prisma.booking.count({
        where: { OR: [{ visitorId: id }, { hostId: id }] },
      }),
      this.prisma.withdrawalRequest.count({ where: { hostId: id } }),
      this.prisma.earningsLedger.count({ where: { hostId: id } }),
    ]);

    if (bookings > 0 || withdrawals > 0 || earnings > 0) {
      throw new ConflictException(
        `This account can't be deleted because it has financial history ` +
          `(${bookings} booking(s), ${withdrawals} withdrawal(s), ${earnings} earnings entr(ies)). ` +
          `Suspend the account instead — that blocks access without erasing the record.`,
      );
    }

    await this.prisma.user.delete({
      where: { id },
    });

    this.logger.log(`User deleted: ${existingUser.email}`);
  }

  async updateStatus(id: string, status: UserStatus): Promise<UserResponseDto> {
    const user = await this.prisma.user.update({
      where: { id },
      data: { status },
      select: USER_SAFE_SELECT,
    });

    this.logger.log(`User status updated to ${status}: ${user.email}`);

    return user as unknown as UserResponseDto;
  }

  // Save (or clear, by passing null) this user's Expo push token. Called
  // after the app registers for push notifications, and whenever the
  // token changes (Expo can rotate it). No-ops are cheap, so callers don't
  // need to dedupe — just call this whenever a token is obtained.
  /** The caller's own saved payout destination, or nulls if never set. */
  async getPayoutDetails(userId: string): Promise<PayoutDetailsResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        payoutBankName: true,
        payoutBankCode: true,
        payoutAccountNumber: true,
        payoutAccountName: true,
        payoutUpdatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      bankName: user.payoutBankName,
      bankCode: user.payoutBankCode,
      accountNumber: user.payoutAccountNumber,
      accountName: user.payoutAccountName,
      updatedAt: user.payoutUpdatedAt,
    };
  }

  /**
   * Change where this host's money gets sent.
   *
   * Gated on the account password rather than the session alone: a stolen or
   * borrowed session is the exact scenario where quietly repointing payouts
   * is worth an attacker's while, and the victim would not notice until the
   * money failed to arrive. The owner is emailed afterwards for the same
   * reason — so a change they did not make is visible immediately.
   */
  async updatePayoutDetails(
    userId: string,
    dto: UpdatePayoutDetailsDto,
  ): Promise<PayoutDetailsResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, password: true, payoutAccountNumber: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const passwordMatches = await PasswordUtil.compare(dto.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('That password is not correct');
    }

    const previousAccount = user.payoutAccountNumber;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        payoutBankName: dto.bankName,
        payoutBankCode: dto.bankCode,
        payoutAccountNumber: dto.accountNumber,
        payoutAccountName: dto.accountName,
        payoutUpdatedAt: new Date(),
      },
      select: {
        payoutBankName: true,
        payoutBankCode: true,
        payoutAccountNumber: true,
        payoutAccountName: true,
        payoutUpdatedAt: true,
      },
    });

    this.logger.log(`Payout details updated for user ${userId}`);

    // Only the last four digits go in the email: if someone else's inbox is
    // reading this, it should confirm a change without handing over the
    // account it now points at.
    const masked = `••••${dto.accountNumber.slice(-4)}`;
    this.notificationService
      .sendPayoutDetailsChangedEmail(user.email, user.firstName, dto.bankName, masked, !!previousAccount)
      .catch((err) => this.logger.error(`Payout-change email to ${user.email} failed:`, err));

    return {
      bankName: updated.payoutBankName,
      bankCode: updated.payoutBankCode,
      accountNumber: updated.payoutAccountNumber,
      accountName: updated.payoutAccountName,
      updatedAt: updated.payoutUpdatedAt,
    };
  }

  async updatePushToken(id: string, pushToken: string | null): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { pushToken },
    });
  }

  async updateRole(id: string, roleId: string): Promise<UserResponseDto> {
    // Check if role exists
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
    });

    if (!role) {
      throw new NotFoundException(`Role with ID '${roleId}' not found`);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: { roleId },
      select: USER_SAFE_SELECT,
    });

    this.logger.log(`User role updated to ${role.name}: ${user.email}`);

    return user as unknown as UserResponseDto;
  }

  async getUserStats(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            properties: true,
            bookings: true,
            hostBookings: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID '${id}' not found`);
    }

    return {
      userId: id,
      propertiesCount: user._count.properties,
      bookingsAsGuest: user._count.bookings,
      bookingsAsHost: user._count.hostBookings,
    };
  }
}
