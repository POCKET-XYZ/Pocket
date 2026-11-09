import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ChatChannel, Prisma } from '@prisma/client';
import type { ChatMessage, ChatThread, ChatUnread, ContractChat } from '@pocket/shared';
import type { AuthUser } from '../../common/types/auth';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  EMAIL_EVERY_MS,
  channelsFor,
  partyOf,
  recipientsOf,
  type ChatParty,
} from './chat-access';

/** The newest messages a chat shows. Older ones stay stored. */
const MESSAGES_SHOWN = 500;

const AUTHOR = {
  select: {
    id: true,
    role: true,
    startupProfile: { select: { companyName: true } },
    specialistProfile: { select: { displayName: true } },
  },
} satisfies Prisma.UserDefaultArgs;

type MessageRow = Prisma.ContractMessageGetPayload<{
  include: { author: typeof AUTHOR };
}>;

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    channel: row.channel,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    author: {
      id: row.author.id,
      role: row.author.role,
      name:
        row.author.startupProfile?.companyName ??
        row.author.specialistProfile?.displayName ??
        null,
    },
  };
}

/**
 * The chats of a contract: the startup and the specialist talk in the
 * contract chat, and during a dispute managers join it and talk to each side
 * in private (see chat-access). Messages are plain text and never change.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Every chat the user sees on the contract, with its messages. */
  async chat(user: AuthUser, contractId: string): Promise<ContractChat> {
    const { contract, hasDispute, channels } = await this.access(user, contractId);
    const [rows, states] = await Promise.all([
      this.prisma.contractMessage.findMany({
        where: { contractId, channel: { in: channels } },
        orderBy: { createdAt: 'desc' },
        take: MESSAGES_SHOWN,
        include: { author: AUTHOR },
      }),
      this.prisma.chatReadState.findMany({ where: { userId: user.sub, contractId } }),
    ]);
    const messages = rows.reverse();
    const threads: ChatThread[] = channels.map((channel) => {
      const readAt = states.find((state) => state.channel === channel)?.lastReadAt;
      const own = messages.filter((message) => message.channel === channel);
      return {
        channel,
        unread: own.filter(
          (message) =>
            message.authorId !== user.sub && (!readAt || message.createdAt > readAt),
        ).length,
        canWrite: contract.status !== 'cancelled',
        messages: own.map(toMessage),
      };
    });
    return { hasDispute, threads };
  }

  /** Write in one of the contract's chats, and tell the others by email. */
  async send(
    user: AuthUser,
    contractId: string,
    channel: ChatChannel,
    body: string,
  ): Promise<ChatMessage> {
    const { contract, party, channels } = await this.access(user, contractId);
    if (!channels.includes(channel)) {
      throw new ForbiddenException('No puedes escribir en este chat');
    }
    if (contract.status === 'cancelled') {
      throw new BadRequestException(
        'Este contrato se canceló: su chat queda solo para leer',
      );
    }
    const row = await this.prisma.contractMessage.create({
      data: { contractId, channel, authorId: user.sub, body },
      include: { author: AUTHOR },
    });
    // Whoever writes has read the chat up to their own message.
    await this.markRead(user.sub, contractId, channel, row.createdAt);
    await this.emailOthers(contract, channel, party, user.sub);
    return toMessage(row);
  }

  /** The user read a chat up to now. */
  async read(user: AuthUser, contractId: string, channel: ChatChannel): Promise<void> {
    const { channels } = await this.access(user, contractId);
    if (!channels.includes(channel)) {
      throw new ForbiddenException('No puedes ver este chat');
    }
    await this.markRead(user.sub, contractId, channel, new Date());
  }

  /** Messages waiting for the user, on every contract they can talk on. */
  async unread(user: AuthUser): Promise<ChatUnread> {
    const contracts = await this.prisma.contract.findMany({
      where:
        user.role === 'manager'
          ? { milestones: { some: { disputes: { some: {} } } } }
          : { OR: [{ startupId: user.sub }, { specialistId: user.sub }] },
      select: { id: true, startupId: true, specialistId: true },
    });
    if (contracts.length === 0) return { total: 0, byContract: {} };
    const [messages, states] = await Promise.all([
      this.prisma.contractMessage.findMany({
        where: {
          contractId: { in: contracts.map((contract) => contract.id) },
          authorId: { not: user.sub },
        },
        select: { contractId: true, channel: true, createdAt: true },
      }),
      this.prisma.chatReadState.findMany({ where: { userId: user.sub } }),
    ]);
    const byContract: Record<string, number> = {};
    for (const contract of contracts) {
      const party = partyOf(user, contract);
      // A private chat only has messages once there is a dispute.
      const visible = party ? channelsFor(party, true) : [];
      const count = messages.filter((message) => {
        if (message.contractId !== contract.id || !visible.includes(message.channel)) {
          return false;
        }
        const readAt = states.find(
          (state) =>
            state.contractId === contract.id && state.channel === message.channel,
        )?.lastReadAt;
        return !readAt || message.createdAt > readAt;
      }).length;
      if (count > 0) byContract[contract.id] = count;
    }
    const total = Object.values(byContract).reduce((sum, count) => sum + count, 0);
    return { total, byContract };
  }

  private async access(user: AuthUser, contractId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        startupId: true,
        specialistId: true,
        status: true,
        job: { select: { title: true } },
        milestones: { select: { _count: { select: { disputes: true } } } },
      },
    });
    if (!contract) throw new NotFoundException('No encontramos el contrato');
    const party = partyOf(user, contract);
    if (!party) throw new ForbiddenException('No eres parte de este contrato');
    const hasDispute = contract.milestones.some((m) => m._count.disputes > 0);
    const channels = channelsFor(party, hasDispute);
    if (channels.length === 0) {
      throw new ForbiddenException(
        'Un manager entra al chat de un contrato cuando hay una disputa',
      );
    }
    return { contract, party, hasDispute, channels };
  }

  private async markRead(
    userId: string,
    contractId: string,
    channel: ChatChannel,
    at: Date,
  ): Promise<void> {
    await this.prisma.chatReadState.upsert({
      where: { userId_contractId_channel: { userId, contractId, channel } },
      create: { userId, contractId, channel, lastReadAt: at },
      update: { lastReadAt: at },
    });
  }

  /**
   * One email per chat at most every 15 minutes for each person: the first
   * message tells them, the ones right after it wait in the chat.
   */
  private async emailOthers(
    contract: {
      id: string;
      startupId: string;
      specialistId: string;
      job: { title: string };
    },
    channel: ChatChannel,
    from: ChatParty,
    authorId: string,
  ): Promise<void> {
    const cutoff = new Date(Date.now() - EMAIL_EVERY_MS);
    for (const userId of recipientsOf(channel, contract)) {
      if (userId === authorId) continue;
      const key = { userId, contractId: contract.id, channel };
      await this.prisma.chatReadState.upsert({
        where: { userId_contractId_channel: key },
        create: key,
        update: {},
      });
      // Claim the email: of two messages at once, only one sends it.
      const claimed = await this.prisma.chatReadState.updateMany({
        where: {
          ...key,
          OR: [{ lastEmailedAt: null }, { lastEmailedAt: { lt: cutoff } }],
        },
        data: { lastEmailedAt: new Date() },
      });
      if (claimed.count !== 1) continue;
      this.notifications.notifyUsers([userId], {
        type: 'chat_message',
        contractId: contract.id,
        jobTitle: contract.job.title,
        from,
      });
    }
  }
}
