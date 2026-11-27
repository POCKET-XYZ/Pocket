'use client';

import type { JobListing } from '@pocket/shared';
import { Link2, Share2 } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { shareText } from '@/lib/job-share';

function jobUrl(job: JobListing): string {
  return `${window.location.origin}/jobs/${job.id}`;
}

function openWindow(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

const subscribeNever = () => () => {};

/** The phone's own share sheet (WhatsApp, Telegram...), where the browser has one. */
function useNativeShare(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => typeof navigator.share === 'function',
    () => false,
  );
}

/** Buttons to post a job on X and LinkedIn, copy its link or share it from the phone. */
export function ShareJobButtons({ job }: { job: JobListing }) {
  const native = useNativeShare();

  async function copy() {
    try {
      await navigator.clipboard.writeText(jobUrl(job));
      toast.success('Enlace copiado');
    } catch {
      toast.error('No se pudo copiar. Copia el enlace desde la barra del navegador.');
    }
  }

  async function shareFromPhone() {
    try {
      await navigator.share({ title: job.title, text: shareText(job), url: jobUrl(job) });
    } catch {
      // Closing the share sheet is not an error worth telling.
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        variant="outline"
        onClick={() =>
          openWindow(
            `https://x.com/intent/post?text=${encodeURIComponent(shareText(job))}&url=${encodeURIComponent(jobUrl(job))}`,
          )
        }
      >
        <XLogo />
        Publicar en X
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          openWindow(
            `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(jobUrl(job))}`,
          )
        }
      >
        <LinkedInLogo />
        LinkedIn
      </Button>
      <Button variant="outline" onClick={copy} className={native ? '' : 'col-span-2'}>
        <Link2 aria-hidden />
        Copiar enlace
      </Button>
      {native ? (
        <Button variant="outline" onClick={shareFromPhone}>
          <Share2 aria-hidden />
          Más opciones
        </Button>
      ) : null}
    </div>
  );
}

/** Shown once, right after a job is posted, so the link goes out while it is fresh. */
export function SharePostedJobDialog({
  job,
  open,
  onClose,
}: {
  job: JobListing;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tu trabajo ya está publicado</DialogTitle>
          <DialogDescription>
            Compártelo para que llegue a más expertos. El enlace se ve con el título, tu
            startup, el presupuesto y la fecha de entrega.
          </DialogDescription>
        </DialogHeader>
        <ShareJobButtons job={job} />
      </DialogContent>
    </Dialog>
  );
}

function XLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedInLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}
