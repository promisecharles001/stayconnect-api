import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordUtil } from '../common/utils/password.util';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthResponseDto, UserResponseDto } from './dto/auth-response.dto';

interface TokenPayload {
  sub: string;
  email: string;
  role: string;
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const { email, password, firstName, lastName, phone, role } = registerDto;

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

    // Determine role — default to GUEST if not provided or invalid
    const roleName = role && ['ADMIN', 'HOST', 'GUEST'].includes(role) ? role : 'GUEST';
    const assignedRole = await this.prisma.role.findUnique({
      where: { name: roleName },
    });

    if (!assignedRole) {
      this.logger.error(`Role "${roleName}" not found in database`);
      throw new NotFoundException(
        `Role "${roleName}" not found. Please run database seed: npm run prisma:seed`,
      );
    }

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone,
        roleId: assignedRole.id,
        status: UserStatus.PENDING_VERIFICATION,
      },
      include: {
        role: true,
      },
    });

    this.logger.log(`User registered successfully: ${user.email}`);

    // Generate tokens
    const tokens = await this.generateTokens(user as any);

    return {
      user: user as unknown as UserResponseDto,
      tokens,
    };
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { email, password, rememberMe } = loginDto;

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await PasswordUtil.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check user status
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Your account has been suspended');
    }

    if (user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedException('Your account is inactive');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.log(`User logged in successfully: ${user.email}`);

    // Generate tokens
    const tokens = await this.generateTokens(user as any, rememberMe);

    const { password: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword as unknown as UserResponseDto,
      tokens,
    };
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto): Promise<Tokens> {
    const { refreshToken } = refreshTokenDto;

    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { role: true },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      if (user.status !== UserStatus.ACTIVE && user.status !== UserStatus.PENDING_VERIFICATION) {
        throw new UnauthorizedException('Account is not active');
      }

      return this.generateTokens(user as any);
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async changePassword(
    userId: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const { currentPassword, newPassword } = changePasswordDto;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await PasswordUtil.compare(currentPassword, user.password);

    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Validate new password strength
    const passwordValidation = PasswordUtil.validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      throw new BadRequestException({
        message: 'New password is too weak',
        details: passwordValidation.errors,
      });
    }

    // Hash new password
    const hashedNewPassword = await PasswordUtil.hash(newPassword);

    // Update password
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    this.logger.log(`Password changed successfully for user: ${user.email}`);

    return { message: 'Password changed successfully' };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto): Promise<{ message: string }> {
    const { email } = forgotPasswordDto;

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // Always return success message to prevent email enumeration
    if (!user) {
      return {
        message: 'If an account exists with this email, you will receive password reset instructions',
      };
    }

    // TODO: Generate password reset token and send email
    this.logger.log(`Password reset requested for: ${email}`);

    return {
      message: 'If an account exists with this email, you will receive password reset instructions',
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<{ message: string }> {
    const { token, newPassword } = resetPasswordDto;

    // TODO: Verify reset token and update password
    throw new BadRequestException('Password reset functionality not yet implemented');
  }

  async logout(userId: string): Promise<{ message: string }> {
    this.logger.log(`User logged out: ${userId}`);
    return { message: 'Logged out successfully' };
  }

  async getProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user as unknown as UserResponseDto;
  }

  private async generateTokens(user: any, rememberMe = false): Promise<Tokens> {
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role.name,
    };

    const accessExpiration = this.configService.get<string>('jwt.accessExpiration') || '15m';
    const refreshExpiration = rememberMe
      ? '30d'
      : this.configService.get<string>('jwt.refreshExpiration') || '7d';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.secret'),
        expiresIn: accessExpiration,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: refreshExpiration,
      }),
    ]);

    // Calculate expiresIn in seconds
    const expiresInMatch = accessExpiration.match(/(\d+)([mhd])/);
    let expiresInSeconds = 900; // Default 15 minutes
    if (expiresInMatch) {
      const value = parseInt(expiresInMatch[1], 10);
      const unit = expiresInMatch[2];
      switch (unit) {
        case 'm':
          expiresInSeconds = value * 60;
          break;
        case 'h':
          expiresInSeconds = value * 60 * 60;
          break;
        case 'd':
          expiresInSeconds = value * 24 * 60 * 60;
          break;
      }
    }

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: expiresInSeconds,
    };
  }
}
