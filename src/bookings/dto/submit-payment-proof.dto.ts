import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class SubmitPaymentProofDto {
  @ApiProperty({
    example: 'https://res.cloudinary.com/.../payment-proofs/abc123.jpg',
    description:
      'URL of the already-uploaded proof image. Clients upload the image through /upload/images first and send the returned URL here.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Payment proof URL is required' })
  paymentProof: string;
}
