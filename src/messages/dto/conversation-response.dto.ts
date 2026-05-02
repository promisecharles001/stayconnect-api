import { ApiProperty } from '@nestjs/swagger';

export class ConversationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  propertyId: string;

  @ApiProperty()
  propertyTitle: string;

  @ApiProperty()
  propertyImage: string | null;

  @ApiProperty()
  guestId: string;

  @ApiProperty()
  guestName: string;

  @ApiProperty()
  hostId: string;

  @ApiProperty()
  hostName: string;

  @ApiProperty()
  lastMessage: string | null;

  @ApiProperty()
  lastMessageAt: Date | null;

  @ApiProperty()
  unreadCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ConversationsResponseDto {
  @ApiProperty({ type: [ConversationResponseDto] })
  conversations: ConversationResponseDto[];

  @ApiProperty()
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
