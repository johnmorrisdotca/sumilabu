import type { ScorecardItem } from "@/lib/scorecard/contract";
import { cardPicture, smallPicture } from "@/lib/scorecard/pictures";

/**
 * An item's picture (SUMILABU-8). Lazy, with its size set so nothing jumps,
 * the dark card when the page is dark, and a plain tile when there is none.
 * The browser fetches it from the item's own Pages or repository host; the
 * server never does.
 */
export function Thumb({ item, size }: { item: Pick<ScorecardItem, "links" | "name">; size: "row" | "card" }) {
  const pic = size === "row" ? smallPicture(item) : cardPicture(item);
  if (size === "row") {
    const w = pic?.square ? 40 : 76;
    if (!pic) return <span aria-hidden data-testid="thumb-none" className="inline-block h-10 w-[76px] shrink-0 rounded-md bg-stone-200/80 dark:bg-stone-800" />;
    return (
      <picture className="shrink-0">
        {pic.dark ? <source media="(prefers-color-scheme: dark)" srcSet={pic.dark} /> : null}
        {/* A plain img, not next/image: next/image would fetch the picture through this site's server, which never fetches pictures. */}
        <img src={pic.light} alt={`${item.name} picture`} width={w} height={40} loading="lazy" decoding="async" referrerPolicy="no-referrer" data-testid="thumb" className="h-10 rounded-md bg-stone-100 object-cover dark:bg-stone-800" style={{ width: w }} />
      </picture>
    );
  }
  if (!pic) return <div aria-hidden data-testid="thumb-none" className="aspect-[1200/630] w-full rounded-xl bg-stone-200/80 dark:bg-stone-800" />;
  return (
    <picture className="block w-full">
      {pic.dark ? <source media="(prefers-color-scheme: dark)" srcSet={pic.dark} /> : null}
      <img src={pic.light} alt={`${item.name} picture`} width={1200} height={630} loading="lazy" decoding="async" referrerPolicy="no-referrer" data-testid="thumb" className={`aspect-[1200/630] h-auto w-full rounded-xl bg-stone-100 dark:bg-stone-800 ${pic.square ? "object-contain" : "object-cover"}`} />
    </picture>
  );
}
