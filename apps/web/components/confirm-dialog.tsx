'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  // Withdraw, decline, delete, remove, close: the confirm button turns red.
  destructive?: boolean;
  // Money moves and it cannot be undone (approving a payment, resolving a
  // dispute): focus starts on Cancel, so a stray Enter does not confirm.
  irreversible?: boolean;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

// One modal for the whole app, in place of the browser confirm box. `confirm` resolves
// true only when the user presses the confirm button; Cancel, Esc or a click
// outside resolve false.
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<Confirm>((next) => {
    resolver.current?.(false);
    setOptions(next);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function settle(confirmed: boolean) {
    resolver.current?.(confirmed);
    resolver.current = null;
    setOpen(false);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) settle(false);
        }}
      >
        <DialogContent
          showCloseButton={false}
          // Like the native box, Enter confirms, except where it would move money.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (options?.irreversible ? cancelButton : confirmButton).current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{options?.title}</DialogTitle>
            {options?.description ? (
              <DialogDescription>{options.description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button ref={cancelButton} variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              ref={confirmButton}
              variant={options?.destructive ? 'destructive' : 'default'}
              onClick={() => settle(true)}
            >
              {options?.confirmText ?? 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside ConfirmProvider');
  return confirm;
}
