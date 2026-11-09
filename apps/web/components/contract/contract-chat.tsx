'use client';

import type {
  ChatChannel,
  ChatMessage,
  ChatThread,
  ContractChat as ContractChatData,
  User,
} from '@pocket/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LockIcon, MessageCircleIcon, SendIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ApiError, api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

/** How often an open chat asks for new messages. */
const POLL_MS = 10_000;

/** Messages from one person this close together read as one block. */
const GROUP_MS = 5 * 60_000;

interface Names {
  startupName?: string;
  specialistName?: string;
}

/** The contract's chats, shared by every place that shows them or their count. */
export function useContractChat(contractId: string) {
  return useQuery({
    queryKey: ['chat', contractId],
    queryFn: () => api<ContractChatData>(`/contracts/${contractId}/chat`),
    refetchInterval: POLL_MS,
    // A manager on a contract without a dispute is told no: nothing to retry.
    retry: false,
  });
}

/**
 * The chats of a contract: the startup and the specialist talk in the
 * contract chat; during a dispute a manager joins it and talks to each side
 * in private. Shown to the two sides always, and to managers once there is a
 * dispute. Messages are never edited or deleted.
 *
 * `panel` fills the height it is given, for the contract page's side column
 * and the phone's full-screen view; `card` is a card of its own in a page.
 */
export function ContractChat({
  contractId,
  user,
  variant = 'card',
  className,
  ...names
}: Names & {
  contractId: string;
  user: User;
  variant?: 'card' | 'panel';
  className?: string;
}) {
  const queryClient = useQueryClient();
  const chat = useContractChat(contractId);
  const [chosen, setChosen] = useState<ChatChannel>('contract');
  const threads = chat.data?.threads ?? [];
  const thread = threads.find((each) => each.channel === chosen) ?? threads[0];

  // What is on screen is read: say so, so the counters go down.
  const unreadHere = thread?.unread ?? 0;
  const channelHere = thread?.channel;
  useEffect(() => {
    if (!channelHere || unreadHere === 0) return;
    void api(`/contracts/${contractId}/chat/${channelHere}/read`, { method: 'POST' })
      .then(() =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ['chat', contractId] }),
          queryClient.invalidateQueries({ queryKey: ['chat', 'unread'] }),
        ]),
      )
      .catch(() => undefined);
  }, [channelHere, unreadHere, contractId, queryClient]);

  if (chat.error instanceof ApiError && chat.error.status === 403) return null;

  return (
    <section
      id="chat"
      aria-label="Mensajes"
      className={cn(
        'flex scroll-mt-24 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm',
        variant === 'card' && 'h-[34rem]',
        className,
      )}
    >
      {thread ? (
        <>
          <ChatHeader thread={thread} user={user} names={names} />
          {threads.length > 1 ? (
            <ThreadTabs
              threads={threads}
              current={thread.channel}
              user={user}
              names={names}
              onChoose={setChosen}
            />
          ) : null}
          <Messages thread={thread} user={user} />
          {thread.canWrite ? (
            <Composer contractId={contractId} channel={thread.channel} />
          ) : (
            <p className="border-t border-border bg-muted/40 px-4 py-3 text-center text-xs text-muted-foreground">
              Este contrato se canceló: su chat queda solo para leer.
            </p>
          )}
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          {chat.error ? 'No pudimos cargar los mensajes.' : 'Cargando mensajes...'}
        </div>
      )}
    </section>
  );
}

/**
 * On a phone the side column does not fit: a floating button, with the count
 * of messages waiting, opens the chat full screen.
 */
export function ContractChatButton(props: Names & { contractId: string; user: User }) {
  const chat = useContractChat(props.contractId);
  if (!chat.data) return null;
  const waiting = chat.data.threads.reduce((sum, thread) => sum + thread.unread, 0);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-navy px-5 py-3 text-sm font-semibold text-off-white shadow-lg transition hover:bg-navy/90 lg:hidden"
        >
          <MessageCircleIcon className="size-5" />
          Mensajes
          {waiting > 0 ? (
            <span className="rounded-full bg-mandarina px-2 text-xs text-white">
              {waiting}
            </span>
          ) : null}
        </button>
      </DialogTrigger>
      <DialogContent className="flex h-[100dvh] max-w-none flex-col gap-0 rounded-none p-0 sm:max-w-none">
        <DialogTitle className="sr-only">Mensajes del contrato</DialogTitle>
        <ContractChat
          {...props}
          variant="panel"
          className="flex-1 rounded-none border-0"
        />
      </DialogContent>
    </Dialog>
  );
}

/** Who the selected chat is with, in words and a face. */
function who(channel: ChatChannel, user: User, names: Names) {
  const startup = names.startupName ?? 'La startup';
  const specialist = names.specialistName ?? 'El experto';
  if (channel === 'contract') {
    if (user.role === 'manager') {
      return {
        name: 'Chat del contrato',
        detail: `${startup} y ${specialist}`,
        avatar: 'Pocket',
      };
    }
    const isStartup = user.role === 'startup';
    return {
      name: isStartup ? specialist : startup,
      detail: isStartup ? 'Experto · Chat del contrato' : 'Startup · Chat del contrato',
      avatar: isStartup ? specialist : startup,
    };
  }
  if (user.role !== 'manager') {
    return { name: 'Equipo de Pocket', detail: 'Privado · Disputa', avatar: 'Pocket' };
  }
  const name = channel === 'manager_startup' ? startup : specialist;
  return { name, detail: 'Privado · Disputa', avatar: name };
}

function ChatHeader({
  thread,
  user,
  names,
}: {
  thread: ChatThread;
  user: User;
  names: Names;
}) {
  const { name, detail, avatar } = who(thread.channel, user, names);
  const isPrivate = thread.channel !== 'contract';
  return (
    <header className="flex items-center gap-3 border-b border-border px-4 py-3">
      <Avatar name={avatar} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-heading text-base font-bold text-navy">{name}</p>
        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          {isPrivate ? <LockIcon className="size-3" aria-hidden /> : null}
          {detail}
        </p>
      </div>
    </header>
  );
}

function ThreadTabs({
  threads,
  current,
  user,
  names,
  onChoose,
}: {
  threads: ChatThread[];
  current: ChatChannel;
  user: User;
  names: Names;
  onChoose: (channel: ChatChannel) => void;
}) {
  const label = (channel: ChatChannel): string => {
    if (channel === 'contract') return 'Contrato';
    if (user.role !== 'manager') return 'Con Pocket';
    return channel === 'manager_startup'
      ? (names.startupName ?? 'La startup')
      : (names.specialistName ?? 'El experto');
  };
  return (
    <div role="tablist" className="flex gap-1 border-b border-border bg-muted/40 p-1.5">
      {threads.map((each) => (
        <button
          key={each.channel}
          type="button"
          role="tab"
          aria-selected={each.channel === current}
          onClick={() => onChoose(each.channel)}
          className={cn(
            'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition',
            each.channel === current
              ? 'bg-card text-navy shadow-sm'
              : 'text-muted-foreground hover:text-navy',
          )}
        >
          {each.channel !== 'contract' ? <LockIcon className="size-3 shrink-0" /> : null}
          <span className="truncate">{label(each.channel)}</span>
          {each.unread > 0 && each.channel !== current ? (
            <span className="rounded-full bg-mandarina px-1.5 text-[10px] font-semibold text-white">
              {each.unread}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** "Hoy", "Ayer" or the date, for the line between days. */
function dayLabel(iso: string): string {
  const day = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(day, today)) return 'Hoy';
  if (same(day, yesterday)) return 'Ayer';
  return day.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

function authorName(message: ChatMessage): string {
  if (message.author.role === 'manager') return 'Equipo de Pocket';
  return (
    message.author.name ??
    (message.author.role === 'startup' ? 'La startup' : 'El experto')
  );
}

function Messages({ thread, user }: { thread: ChatThread; user: User }) {
  const end = useRef<HTMLDivElement>(null);
  const count = thread.messages.length;
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [count, thread.channel]);

  if (count === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-muted/30 p-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-celeste-light text-navy">
          <MessageCircleIcon className="size-6" />
        </span>
        <div>
          <p className="font-heading font-bold text-navy">Todavía no hay mensajes</p>
          <p className="mt-1 max-w-64 text-sm text-muted-foreground">
            {hint(thread.channel, user)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-1 overflow-y-auto bg-muted/30 px-4 py-4">
      <p className="mb-3 text-center text-xs text-muted-foreground">
        {hint(thread.channel, user)}
      </p>
      {thread.messages.map((message, index) => {
        const before = thread.messages[index - 1];
        const newDay =
          !before || dayLabel(before.createdAt) !== dayLabel(message.createdAt);
        const sameBlock =
          !newDay &&
          before.author.id === message.author.id &&
          Date.parse(message.createdAt) - Date.parse(before.createdAt) < GROUP_MS;
        const mine = message.author.id === user.id;
        return (
          <div key={message.id}>
            {newDay ? (
              <div className="my-3 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                {dayLabel(message.createdAt)}
                <span className="h-px flex-1 bg-border" />
              </div>
            ) : null}
            <div
              className={cn(
                'flex flex-col',
                mine ? 'items-end' : 'items-start',
                sameBlock ? 'mt-0.5' : 'mt-3',
              )}
            >
              {!mine && !sameBlock ? (
                <span className="mb-1 px-1 text-xs font-medium text-navy">
                  {authorName(message)}
                </span>
              ) : null}
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
                  mine
                    ? 'rounded-br-md bg-navy text-off-white'
                    : message.author.role === 'manager'
                      ? 'rounded-bl-md border border-celeste bg-celeste-light text-navy'
                      : 'rounded-bl-md border border-border bg-card text-foreground',
                )}
              >
                <p className="whitespace-pre-line break-words">{message.body}</p>
                <p
                  className={cn(
                    'mt-0.5 text-right text-[10px]',
                    mine ? 'text-off-white/60' : 'text-muted-foreground',
                  )}
                >
                  {timeOf(message.createdAt)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}

function hint(channel: ChatChannel, user: User): string {
  if (channel === 'contract') {
    return user.role === 'manager'
      ? 'Lo ven la startup, el experto y el equipo de Pocket.'
      : 'Habla aquí con la otra parte. Si hay una disputa, también lo lee el equipo de Pocket.';
  }
  return user.role === 'manager'
    ? 'Privado: solo lo ven esta parte y el equipo de Pocket.'
    : 'Privado: solo lo ven tú y el equipo de Pocket, que revisa la disputa.';
}

function Composer({ contractId, channel }: { contractId: string; channel: ChatChannel }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const send = useMutation({
    mutationFn: (text: string) =>
      api(`/contracts/${contractId}/chat/${channel}`, {
        method: 'POST',
        body: { body: text },
      }),
    onSuccess: async () => {
      setBody('');
      await queryClient.invalidateQueries({ queryKey: ['chat', contractId] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const text = body.trim();

  // The box grows with what is typed, up to a few lines.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [body]);

  function submit() {
    if (text && !send.isPending) send.mutate(text);
  }

  return (
    <form
      className="border-t border-border bg-card px-3 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex items-end gap-2 rounded-2xl border border-border bg-muted/40 py-1.5 pr-1.5 pl-3 focus-within:border-celeste focus-within:ring-2 focus-within:ring-celeste/30">
        <textarea
          ref={box}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter starts a new line.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          maxLength={2000}
          rows={1}
          placeholder="Escribe un mensaje"
          aria-label="Mensaje"
          className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!text || send.isPending}
          aria-label="Enviar"
          className="size-9 shrink-0 rounded-full"
        >
          <SendIcon className="size-4" />
        </Button>
      </div>
      <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
        Enter envía · Shift+Enter, nueva línea
      </p>
    </form>
  );
}
