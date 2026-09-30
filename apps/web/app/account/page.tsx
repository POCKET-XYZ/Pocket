'use client';

import { DownloadIcon, Trash2Icon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth-provider';
import { PRIVACY_EMAIL } from '@/components/legal-page';
import { PageHeader } from '@/components/page';
import { RequireAuth } from '@/components/require-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';

export default function AccountPage() {
  return (
    <RequireAuth>
      {() => (
        <div className="mx-auto max-w-3xl space-y-6">
          <PageHeader
            title="Your account and data"
            description="Download everything Pocket holds about you, or delete your account."
          />
          <ExportCard />
          <RightsCard />
          <DeleteCard />
        </div>
      )}
    </RequireAuth>
  );
}

function ExportCard() {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const data = await api<unknown>('/users/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pocket-data-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Download your data</CardTitle>
        <CardDescription>
          Your account, verification, profile, jobs, applications, contracts, deliveries,
          disputes and consent records, in one JSON file. Your CV is listed; download the PDF
          from your profile.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" disabled={busy} onClick={() => void download()}>
          <DownloadIcon className="size-4" />
          {busy ? 'Preparing...' : 'Download my data'}
        </Button>
      </CardContent>
    </Card>
  );
}

function RightsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Correct or limit the use of your data</CardTitle>
        <CardDescription>
          Correct your profile from <Link href="/profile" className="underline">your profile
          page</Link>. To correct anything else, object to a use of your data, withdraw a consent
          or ask anything about your data, write to {PRIVACY_EMAIL}. See the{' '}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>{' '}
          for all your rights.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function DeleteCard() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  if (user?.role === 'manager') return null;

  async function remove() {
    setBusy(true);
    try {
      await api('/users/me/delete', { method: 'POST', body: { confirm } });
      toast.success('Your account was deleted');
      signOut();
      router.replace('/');
    } catch (error) {
      toast.error(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Delete your account</CardTitle>
        <CardDescription>
          This cannot be undone. Download your data first if you want a copy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            Deleted: your profile, your CV, your verification details, your email and the link
            between your account and your wallet. You are signed out everywhere.
          </li>
          <li>
            Closed: your open jobs and pending applications. Offers still waiting for the
            specialist are withdrawn.
          </li>
          <li>
            Kept, attached to an anonymous account: the contracts, payments and disputes you
            took part in, because they are also the other party&apos;s records and the law asks
            us to keep them.
          </li>
          <li>
            Not possible while money you are part of is in an escrow: finish or resolve those
            contracts first.
          </li>
          <li>
            Your wallet and its payments stay on the Stellar network, which nobody can delete.
            A Pollar wallet stays with Pollar.
          </li>
        </ul>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive">
              <Trash2Icon className="size-4" />
              Delete my account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete your account?</DialogTitle>
              <DialogDescription>
                Type DELETE to confirm. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <Input
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="DELETE"
              aria-label="Type DELETE to confirm"
            />
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={confirm !== 'DELETE' || busy}
                onClick={() => void remove()}
              >
                {busy ? 'Deleting...' : 'Delete my account'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
