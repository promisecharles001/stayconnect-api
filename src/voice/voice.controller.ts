import { Controller, Post, Body, HttpCode, HttpStatus, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { VoiceService } from './voice.service';
import { GenerateTokenDto } from './dto/generate-token.dto';
import { SignalCallDto } from './dto/signal-call.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { UnauthorizedException } from '@nestjs/common';

@ApiTags('Voice Calling')
@Controller('voice')
@ApiBearerAuth()
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Post('generate-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate LiveKit access token for voice calling',
    description: 'Generates a secure LiveKit access token for real-time voice communication. Token expires in 1 hour.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Token generated successfully',
    type: TokenResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input parameters',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - JWT token required',
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'LiveKit credentials not configured',
  })
  async generateToken(@Request() req: any, @Body() generateTokenDto: GenerateTokenDto): Promise<TokenResponseDto> {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    
    return this.voiceService.generateToken(generateTokenDto, userId);
  }

  @Post('signal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tell the other party a call was declined or abandoned',
    description:
      'Lets a callee decline an incoming call, or a caller cancel one nobody answered. ' +
      'Cancelling also sends the callee a "missed call" notification.',
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a party to that call' })
  async signal(@Request() req: any, @Body() dto: SignalCallDto): Promise<{ ok: true }> {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.voiceService.signalCall(userId, dto);
  }

  @Post('config-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get LiveKit configuration status',
    description: 'Check if LiveKit credentials are properly configured.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Configuration status retrieved',
  })
  getConfigStatus() {
    return this.voiceService.getConfigStatus();
  }
}
