import NextAuth from "next-auth";

import { buildAuthOptions } from "@/lib/auth/options";

/**
 * Google sign-in for the pages (lib/auth/options.ts). The gate leaves
 * `/api/auth/…` open: the sign-in cannot sit behind the sign-in. It reads no
 * database; a refused address gets no cookie and lands on /not-allowed.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = NextAuth(buildAuthOptions());

export { handler as GET, handler as POST };
