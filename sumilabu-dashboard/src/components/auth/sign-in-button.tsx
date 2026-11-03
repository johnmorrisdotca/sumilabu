"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

/**
 * Starts Google's sign-in. From umakuma's `GoogleSignInButton`: next-auth's
 * client `signIn` (which fetches the CSRF token and posts it), with
 * Google's account chooser every time.
 */
export function SignInButton({ callbackUrl }: { callbackUrl: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      data-testid="google-sign-in"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signIn("google", { callbackUrl }, { prompt: "select_account" }).catch(() => setBusy(false));
      }}
      className="min-h-11 rounded-full border border-stone-900 bg-stone-900 px-4 py-2 text-sm text-stone-50 hover:bg-stone-700 disabled:opacity-60"
    >
      {busy ? "Opening Google…" : "Sign in with Google"}
    </button>
  );
}
