import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

export interface BankTransferDetails {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

/**
 * Serves app-wide config that the mobile client needs but shouldn't have
 * hardcoded — anything here can change (e.g. you switch banks) without
 * needing an app store release.
 */
@ApiTags('Config')
@Controller('config')
@ApiBearerAuth()
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get('payment-details')
  @ApiOperation({ summary: 'Get bank transfer details for manual payment proof flow' })
  getPaymentDetails(): BankTransferDetails {
    return {
      bankName: this.configService.get<string>('BANK_NAME') || '',
      accountNumber: this.configService.get<string>('BANK_ACCOUNT_NUMBER') || '',
      accountName: this.configService.get<string>('BANK_ACCOUNT_NAME') || '',
    };
  }
}
