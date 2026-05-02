import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordUtil } from '../common/utils/password.util';
import { PaginationUtil, PaginatedResult } from '../common/utils/pagination.util';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserStatus } from '@prisma/client';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

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
      include: { role: true },
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
      include: { role: true },
    });

    return PaginationUtil.createResult(users as unknown as UserResponseDto[], total, { page, limit });
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });

    if (!user) {
      throw new NotFoundException(`User with ID '${id}' not found`);
    }

    return user as unknown as UserResponseDto;
  }

  async findByEmail(email: string): Promise<UserResponseDto | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { role: true },
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
      include: { role: true },
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

    // Delete user
    await this.prisma.user.delete({
      where: { id },
    });

    this.logger.log(`User deleted: ${existingUser.email}`);
  }

  async updateStatus(id: string, status: UserStatus): Promise<UserResponseDto> {
    const user = await this.prisma.user.update({
      where: { id },
      data: { status },
      include: { role: true },
    });

    this.logger.log(`User status updated to ${status}: ${user.email}`);

    return user as unknown as UserResponseDto;
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
      include: { role: true },
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
