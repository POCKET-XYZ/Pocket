'use client';

import type { ChatChannel, ChatThread, ContractChat, User } from '@pocket/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircleIcon, SendIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, api, errorMessage } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

/** How often an open chat asks for new messages. */
const POLL_MS = 10_000;

/**
 * The chats of a contract: the startup and the specialist talk in the
 * contract chat; during a dispute a manager joins it and talks to each side
 * in private. Shown to the two sides always, and to managers once there is a
 * dispute. Messages are never edited or deleted.
 */
export function ContractChatCard({
  contractId,
  user,
  startupName,
  specialistName,
}: {
  contractId: string;
  user: User;
  startupName?: string;
  specialistName?: string;
}) {
  const queryClient = useQueryClient();
  const chat = useQuery({
    queryKey: ['chat', contractId],
    queryFn: () => api<ContractChat>(`/contracts/${contractId}/chat`),
    refetchInterval: POLL_MS,
    // A manager on a contract without a dispute is told no: nothing to retry.
    retry: false,
  });
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
  if (!thread) return null;

  const label = (channel: ChatChannel): string => {
    if (channel === 'contract') return 'Chat del contrato';
    if (user.role !== 'manager') return 'Con Pocket';
    return channel === 'manager_startup'
      ? `Con ${startupName ?? 'la startup'}`
      : `Con ${specialistName ?? 'el experto'}`;
  };

  return (
    <Card id="chat" className="scroll-mt-24">
      <CardHeader className="space-y-3">
        <CardTitle className="flex items-center gap-2">
          <MessageCircleIcon className="size-5 text-navy" />
          Mensajes
        </CardTitle>
        {threads.length > 1 ? (
          <div className="flex flex-wrap gap-2" role="tablist">
            {threads.map((each) => (
              <button
                key={each.channel}
                type="button"
                role="tab"
                aria-selected={each.channel === thread.channel}
                onClick={() => setChosen(each.channel)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition',
                  each.channel === thread.channel
                    ? 'border-navy bg-navy text-off-white'
                    : 'border-border bg-card text-navy hover:border-celeste',
                )}
              >
                {label(each.channel)}
                {each.unread > 0 && each.channel !== thread.channel ? (
                  <span className="rounded-full bg-mandarina px-1.5 text-xs font-semibold text-white">
                    {each.unread}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
        <p className="text-sm text-muted-foreground">{hint(thread.channel, user)}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Messages thread={thread} user={user} />
        {thread.canWrite ? (
          <Composer contractId={contractId} channel={thread.channel} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Este contrato se canceló: su chat queda solo para leer.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function hint(channel: ChatChannel, user: User): string {
  if (channel === 'contract') {
    return user.role === 'manager'
      ? 'Lo ven la startup, el experto y el equipo de Pocket.'
      : 'Habla aquí con la otra parte. Durante una disputa también lo lee el equipo de Pocket.';
  }
  return user.role === 'manager'
    ? 'Privado: solo lo ven esta parte y el equipo de Pocket.'
    : 'Privado: solo lo ven tú y el equipo de Pocket, que revisa la disputa.';
}

function Messages({ thread, user }: { thread: ChatThread; user: User }) {
  const end = useRef<HTMLDivElement>(null);
  const count = thread.messages.length;
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [count]);

  if (count === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        Todavía no hay mensajes.
      </p>
    );
  }
  return (
    <div className="max-h-96 space-y-3 overflow-y-auto rounded-xl bg-muted/40 p-3">
      {thread.messages.map((message) => {
        const mine = message.author.id === user.id;
        const who = mine
          ? 'Tú'
          : message.author.role === 'manager'
            ? 'Pocket'
            : (message.author.name ??
              (message.author.role === 'startup' ? 'La startup' : 'El experto'));
        return (
          <div
            key={message.id}
            className={cn('flex', mine ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                mine
                  ? 'bg-navy text-off-white'
                  : 'border border-border bg-card text-foreground',
              )}
            >
              <p
                className={cn(
                  'text-xs',
                  mine ? 'text-off-white/70' : 'text-muted-foreground',
                )}
              >
                {who} · {dateTime(message.createdAt)}
              </p>
              <p className="mt-0.5 whitespace-pre-line break-words">{message.body}</p>
            </div>
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}

function Composer({ contractId, channel }: { contractId: string; channel: ChatChannel }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
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

  function submit() {
    if (text && !send.isPending) send.mutate(text);
  }

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Textarea
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
        rows={2}
        placeholder="Escribe un mensaje"
        aria-label="Mensaje"
      />
      <Button type="submit" disabled={!text || send.isPending} aria-label="Enviar">
        <SendIcon />
        Enviar
      </Button>
    </form>
  );
}
