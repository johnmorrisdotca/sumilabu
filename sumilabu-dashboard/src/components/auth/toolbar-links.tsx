"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The toolbar's places. A short row, never a menu that folds open (John's rule). */
export const TOOLBAR_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/packages", label: "Packages" },
  { href: "/packages/map", label: "Package map" },
  { href: "/api/openapi.json", label: "API", external: true },
] as const;

export function ToolbarLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Site" className="flex items-center gap-1">
      {TOOLBAR_LINKS.map((link) => {
        const here = !("external" in link) && pathname === link.href;
        const className = `rounded-full px-2.5 py-1 ${here ? "bg-stone-50 text-stone-900" : "text-stone-200 hover:bg-stone-700 hover:text-white"}`;
        /* The API contract is JSON, not a page: a plain link, so Next does not try to route it. */
        return "external" in link ? (
          <a key={link.href} href={link.href} className={className}>
            {link.label}
          </a>
        ) : (
          <Link key={link.href} href={link.href} aria-current={here ? "page" : undefined} className={className}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
