import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Door } from "@/components/auth/door";
import { SignInButton } from "@/components/auth/sign-in-button";
import { safeCallback } from "@/lib/auth/callback";
import { currentAdmin } from "@/lib/auth/current";
import { isGoogleAuthConfigured } from "@/lib/auth/options";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in · SumiLabu",
  description: "Private.",
  robots: { index: false, follow: false },
};

/** The one page a signed-out visitor sees. Words and a button; nothing is read but the session cookie. */
export default async function SignInPage({ searchParams }: { searchParams?: Promise<{ callbackUrl?: string | string[] }> }) {
  const callbackUrl = safeCallback((await searchParams)?.callbackUrl);
  if (await currentAdmin()) redirect(callbackUrl);

  return (
    <Door title="Private site" testId="sign-in">
      <p className="text-sm text-stone-700">Only the site&apos;s owner may sign in. Apps and agents use the API with their own keys.</p>
      {isGoogleAuthConfigured() ? (
        <SignInButton callbackUrl={callbackUrl} />
      ) : (
        <p role="alert" className="text-sm text-red-700">
          Sign-in is not set up on this deployment.
        </p>
      )}
    </Door>
  );
}
