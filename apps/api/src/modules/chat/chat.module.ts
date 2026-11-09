import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

/** A chat per contract, and a manager's private chats during a dispute. */
@Module({
  imports: [NotificationsModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
