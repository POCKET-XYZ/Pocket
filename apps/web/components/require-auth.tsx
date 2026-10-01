'use client';

import type { User, UserRole } from '@pocket/shared';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState, Loading } from '@/components/page';
import { Button } from '@/components/ui/button';
import { homeFor } from '@/lib/home';

const VERIFICATION_HINTS: Record<string, string> = {
  not_submitted:
    'Submit your details for verification. A Pocket manager reviews every account.',
  pending:
    'Your verification is under review. You can use the marketplace once a manager approves it.',
  rejected:
    "Your verification was rejected. Check the manager's note, fix your details and submit again.",
};

/**
 * Renders its children only for a signed-in user with one of the given roles,
 * and, when `verified` is set, only once a manager approved them. Otherwise it
 * says what is missing and links to the fix.
 */
export function RequireAuth({
  roles,
  verified = false,
  children,
}: {
  roles?: UserRole[];
  verified?: boolean;
  children: (user: User) => React.ReactNode;
}) {
  const { status, user, refreshUser } = useAuth();

  if (status === 'loading') return <Loading />;

  // Signed in, but Pocket cannot be reached: not the same as signed out.
  if (status === 'unreachable') {
    return (
      <EmptyState title="Pocket cannot be reached right now">
        <p>Your session is fine. Check your connection and try again in a moment.</p>
        <Button className="mt-4" onClick={() => void refreshUser()}>
          Try again
        </Button>
      </EmptyState>
    );
  }

  if (!user) {
    return (
      <EmptyState title="Sign in to continue">
        <Button asChild className="mt-4">
          <Link href="/login">Sign in</Link>
        </Button>
      </EmptyState>
    );
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <EmptyState title="This page is not for your account">
        <p>It is only for {roles.join(' or ')} accounts.</p>
        <Button asChild className="mt-4">
          <Link href={homeFor(user)}>Go to your home</Link>
        </Button>
      </EmptyState>
    );
  }

  if (verified && user.role !== 'manager' && user.verificationStatus !== 'approved') {
    return (
      <EmptyState title="Your account is not verified yet">
        <p>{VERIFICATION_HINTS[user.verificationStatus]}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/verification">Go to verification</Link>
          </Button>
          {user.verificationStatus === 'pending' ? <CheckAgainButton /> : null}
        </div>
      </EmptyState>
    );
  }

  return <>{children(user)}</>;
}

/** Asks the API again, for the moment right after a manager approves. */
function CheckAgainButton() {
  const { refreshUser } = useAuth();
  const [checking, setChecking] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={checking}
      onClick={() => {
        setChecking(true);
        void refreshUser().finally(() => setChecking(false));
      }}
    >
      {checking ? 'Checking...' : 'Check again'}
    </Button>
  );
}
