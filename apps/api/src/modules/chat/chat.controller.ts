import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ChatChannel } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  RateLimit,
  type RateLimitRule,
} from '../../common/rate-limit/rate-limit.decorator';
import type { AuthUser } from '../../common/types/auth';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';

/** A conversation pace: enough to talk, not to flood the other side. */
const CHAT_RATE_LIMIT: RateLimitRule = { bucket: 'chat', limit: 30, windowSeconds: 60 };

@ApiTags('chat')
@ApiBearerAuth()
@Controller()
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /** Every chat of the contract the user can see, with its messages. */
  @Get('contracts/:id/chat')
  contractChat(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.chat(user, id);
  }

  @RateLimit(CHAT_RATE_LIMIT)
  @Post('contracts/:id/chat/:channel')
  send(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('channel', new ParseEnumPipe(ChatChannel)) channel: ChatChannel,
    @Body() dto: SendMessageDto,
  ) {
    return this.chat.send(user, id, channel, dto.body);
  }

  /** The user read the chat up to now. */
  @Post('contracts/:id/chat/:channel/read')
  @HttpCode(204)
  async read(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('channel', new ParseEnumPipe(ChatChannel)) channel: ChatChannel,
  ): Promise<void> {
    await this.chat.read(user, id, channel);
  }

  /** Messages waiting for the user, per contract. */
  @Get('chat/unread')
  unread(@CurrentUser() user: AuthUser) {
    return this.chat.unread(user);
  }
}
