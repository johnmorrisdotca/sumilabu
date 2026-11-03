"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

/** Ends the session (next-auth's signOut posts with its CSRF token) and returns to the sign-in page. */
export function SignOutButton({ className }: { className: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      data-testid="sign-out"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signOut({ callbackUrl: "/signin" }).catch(() => setBusy(false));
      }}
      className={className}
    >
      Sign out
    </button>
  );
}
