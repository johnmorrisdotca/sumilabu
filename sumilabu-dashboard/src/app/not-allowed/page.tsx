import type { Metadata } from "next";
import Link from "next/link";

import { Door } from "@/components/auth/door";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Not allowed · SumiLabu",
  description: "Private.",
  robots: { index: false, follow: false },
};

/**
 * Where next-auth sends a refused sign-in (`pages.error`). `AccessDenied` is
 * our own refusal - an address not on SUMILABU_ADMIN_EMAILS, or one Google has
 * not verified - and gets the plain answer. Anything else is a sign-in that
 * broke on the way (Google, the configuration) and says so, never with
 * Google's or next-auth's own text.
 */
export default async function NotAllowedPage({ searchParams }: { searchParams?: Promise<{ error?: string | string[] }> }) {
  const error = (await searchParams)?.error;
  const refused = error === undefined || error === "AccessDenied";
  return (
    <Door title={refused ? "Not allowed" : "Sign-in did not work"} testId="not-allowed">
      <p className="text-sm text-stone-700">
        {refused ? "This site is private, and that Google account is not on its list." : "Something went wrong between this site and Google. Try again."}
      </p>
      <Link href="/signin" className="min-h-11 rounded-full border border-stone-300 bg-white px-4 py-2 text-center text-sm text-stone-700 hover:border-stone-500">
        {refused ? "Use another account" : "Back to sign-in"}
      </Link>
    </Door>
  );
}
