import { currentAdmin } from "@/lib/auth/current";

import { SignOutButton } from "./sign-out-button";
import { ToolbarLinks } from "./toolbar-links";

/**
 * The admin toolbar, on every signed-in page (SUMILABU-7): the site's pages,
 * the API contract, who is signed in, and Sign out. In the root layout rather
 * than on each page, like itsutsu's TestModeBanner, so "every page" stays true
 * for a page added later. Signed out it draws nothing; it reads the session
 * cookie only, never the database.
 *
 * One thin row that wraps on a phone: the places first, then the address
 * (cut short with an ellipsis, the whole of it in the tooltip) and Sign out.
 */
export async function AdminToolbar() {
  const admin = await currentAdmin();
  if (!admin) return null;
  return (
    <div data-testid="admin-toolbar" className="w-full bg-stone-900 text-xs text-stone-100 print:hidden">
      <div className="mx-auto flex max-w-[110rem] flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 md:px-8">
        <span className="font-semibold uppercase tracking-[0.2em] text-stone-400">SumiLabu</span>
        <ToolbarLinks />
        <span className="ml-auto flex min-w-0 items-center gap-2">
          <span data-testid="admin-email" title={admin.email} className="max-w-[14rem] truncate text-stone-300">
            {admin.email}
          </span>
          <SignOutButton className="rounded-full border border-stone-600 px-2.5 py-1 text-stone-100 hover:border-stone-300 disabled:opacity-60" />
        </span>
      </div>
    </div>
  );
}
