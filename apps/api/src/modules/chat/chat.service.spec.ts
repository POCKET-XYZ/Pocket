import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth';
import type { PrismaService } from '../../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { channelsFor, partyOf, recipientsOf } from './chat-access';
import { ChatService } from './chat.service';

const startup: AuthUser = { sub: 'startup-1', role: 'startup', stellarAddress: 'GS' };
const specialist: AuthUser = {
  sub: 'specialist-1',
  role: 'specialist',
  stellarAddress: 'GP',
};
const manager: AuthUser = { sub: 'manager-1', role: 'manager', stellarAddress: 'GM' };
const stranger: AuthUser = { sub: 'startup-2', role: 'startup', stellarAddress: 'GX' };

const PARTIES = { startupId: 'startup-1', specialistId: 'specialist-1' };

describe('chat access', () => {
  it('knows each side of the contract and the managers', () => {
    expect(partyOf(startup, PARTIES)).toBe('startup');
    expect(partyOf(specialist, PARTIES)).toBe('specialist');
    expect(partyOf(manager, PARTIES)).toBe('manager');
    expect(partyOf(stranger, PARTIES)).toBeNull();
  });

  it('gives the two sides the contract chat, and a private one with Pocket in a dispute', () => {
    expect(channelsFor('startup', false)).toEqual(['contract']);
    expect(channelsFor('startup', true)).toEqual(['contract', 'manager_startup']);
    expect(channelsFor('specialist', true)).toEqual(['contract', 'manager_specialist']);
  });

  it('lets managers in only once there is a dispute', () => {
    expect(channelsFor('manager', false)).toEqual([]);
    expect(channelsFor('manager', true)).toEqual([
      'contract',
      'manager_startup',
      'manager_specialist',
    ]);
  });

  it('emails each chat to its side only', () => {
    expect(recipientsOf('contract', PARTIES)).toEqual(['startup-1', 'specialist-1']);
    expect(recipientsOf('manager_startup', PARTIES)).toEqual(['startup-1']);
    expect(recipientsOf('manager_specialist', PARTIES)).toEqual(['specialist-1']);
  });
});

describe('ChatService', () => {
  let prisma: {
    contract: { findUnique: jest.Mock; findMany: jest.Mock };
    contractMessage: { findMany: jest.Mock; create: jest.Mock };
    chatReadState: { findMany: jest.Mock; upsert: jest.Mock; updateMany: jest.Mock };
  };
  let notifications: { notifyUsers: jest.Mock };
  let service: ChatService;

  const contract = (overrides: Record<string, unknown> = {}) => ({
    id: 'contract-1',
    ...PARTIES,
    status: 'active',
    job: { title: 'Video corto' },
    milestones: [{ _count: { disputes: 0 } }],
    ...overrides,
  });
  const row = (overrides: Record<string, unknown> = {}) => ({
    id: 'message-1',
    contractId: 'contract-1',
    channel: 'contract',
    authorId: 'startup-1',
    body: 'Hola',
    createdAt: new Date('2026-11-08T10:00:00Z'),
    author: {
      id: 'startup-1',
      role: 'startup',
      startupProfile: { companyName: 'Qa Labs' },
      specialistProfile: null,
    },
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      contract: {
        findUnique: jest.fn().mockResolvedValue(contract()),
        findMany: jest.fn(),
      },
      contractMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(row()),
      },
      chatReadState: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    notifications = { notifyUsers: jest.fn() };
    service = new ChatService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  it('shows the contract chat to its two sides, with who wrote and what is unread', async () => {
    prisma.contractMessage.findMany.mockResolvedValue([row()]);
    const chat = await service.chat(specialist, 'contract-1');
    expect(chat.hasDispute).toBe(false);
    expect(chat.threads).toEqual([
      {
        channel: 'contract',
        unread: 1,
        canWrite: true,
        messages: [
          {
            id: 'message-1',
            channel: 'contract',
            body: 'Hola',
            createdAt: '2026-11-08T10:00:00.000Z',
            author: { id: 'startup-1', role: 'startup', name: 'Qa Labs' },
          },
        ],
      },
    ]);
  });

  it('counts nothing as unread once read, or when the user wrote it', async () => {
    prisma.contractMessage.findMany.mockResolvedValue([row()]);
    prisma.chatReadState.findMany.mockResolvedValue([
      { channel: 'contract', lastReadAt: new Date('2026-11-08T11:00:00Z') },
    ]);
    expect((await service.chat(specialist, 'contract-1')).threads[0].unread).toBe(0);
    prisma.chatReadState.findMany.mockResolvedValue([]);
    expect((await service.chat(startup, 'contract-1')).threads[0].unread).toBe(0);
  });

  it('keeps out anyone who is not part of the contract', async () => {
    await expect(service.chat(stranger, 'contract-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('keeps managers out of a contract without a dispute', async () => {
    await expect(service.chat(manager, 'contract-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('gives a manager the three chats of a disputed contract', async () => {
    prisma.contract.findUnique.mockResolvedValue(
      contract({ milestones: [{ _count: { disputes: 1 } }] }),
    );
    const chat = await service.chat(manager, 'contract-1');
    expect(chat.threads.map((thread) => thread.channel)).toEqual([
      'contract',
      'manager_startup',
      'manager_specialist',
    ]);
  });

  it('sends a message, marks it read for its author and emails the other side', async () => {
    const message = await service.send(startup, 'contract-1', 'contract', 'Hola');
    expect(message.body).toBe('Hola');
    expect(prisma.contractMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          contractId: 'contract-1',
          channel: 'contract',
          authorId: 'startup-1',
          body: 'Hola',
        },
      }),
    );
    expect(prisma.chatReadState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_contractId_channel: {
            userId: 'startup-1',
            contractId: 'contract-1',
            channel: 'contract',
          },
        },
      }),
    );
    expect(notifications.notifyUsers).toHaveBeenCalledTimes(1);
    expect(notifications.notifyUsers).toHaveBeenCalledWith(['specialist-1'], {
      type: 'chat_message',
      contractId: 'contract-1',
      jobTitle: 'Video corto',
      from: 'startup',
    });
  });

  it('groups emails: none while the last one is under 15 minutes old', async () => {
    prisma.chatReadState.updateMany.mockResolvedValue({ count: 0 });
    await service.send(startup, 'contract-1', 'contract', 'Hola otra vez');
    expect(notifications.notifyUsers).not.toHaveBeenCalled();
  });

  it('keeps a side out of the other side private chat', async () => {
    prisma.contract.findUnique.mockResolvedValue(
      contract({ milestones: [{ _count: { disputes: 1 } }] }),
    );
    await expect(
      service.send(startup, 'contract-1', 'manager_specialist', 'Hola'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a manager in a dispute writes privately to one side, who gets the email', async () => {
    prisma.contract.findUnique.mockResolvedValue(
      contract({ milestones: [{ _count: { disputes: 1 } }] }),
    );
    await service.send(manager, 'contract-1', 'manager_specialist', 'Cuéntame qué pasó');
    expect(notifications.notifyUsers).toHaveBeenCalledWith(
      ['specialist-1'],
      expect.objectContaining({ from: 'manager' }),
    );
  });

  it('leaves the chat of a cancelled contract for reading', async () => {
    prisma.contract.findUnique.mockResolvedValue(contract({ status: 'cancelled' }));
    await expect(
      service.send(startup, 'contract-1', 'contract', 'Hola'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect((await service.chat(startup, 'contract-1')).threads[0].canWrite).toBe(false);
  });

  it('counts unread messages per contract', async () => {
    prisma.contract.findMany.mockResolvedValue([{ id: 'contract-1', ...PARTIES }]);
    prisma.contractMessage.findMany.mockResolvedValue([
      {
        contractId: 'contract-1',
        channel: 'contract',
        createdAt: new Date('2026-11-08T10:00:00Z'),
      },
      {
        contractId: 'contract-1',
        channel: 'contract',
        createdAt: new Date('2026-11-08T12:00:00Z'),
      },
      // The startup's private chat with Pocket is not the specialist's.
      {
        contractId: 'contract-1',
        channel: 'manager_startup',
        createdAt: new Date('2026-11-08T12:00:00Z'),
      },
    ]);
    prisma.chatReadState.findMany.mockResolvedValue([
      {
        contractId: 'contract-1',
        channel: 'contract',
        lastReadAt: new Date('2026-11-08T11:00:00Z'),
      },
    ]);
    await expect(service.unread(specialist)).resolves.toEqual({
      total: 1,
      byContract: { 'contract-1': 1 },
    });
  });
});
