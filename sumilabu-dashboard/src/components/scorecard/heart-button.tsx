/**
 * The heart on an item (SUMILABU-9): a real button, pressed when the item is a
 * favourite. 44 px on a touch screen, smaller under a mouse so a table row
 * stays a row. The name is in the tooltip; the label is the action.
 */
export function HeartButton({ on, name, onToggle, large = false }: { on: boolean; name: string; onToggle: () => void; large?: boolean }) {
  const label = on ? "Remove from favourites" : "Add to favourites";
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={`${label}: ${name}`}
      onClick={onToggle}
      data-testid="heart"
      className={`inline-flex shrink-0 items-center justify-center rounded-full align-middle transition hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-rose-600 dark:hover:bg-rose-950 print:hidden ${
        large ? "h-11 w-11" : "h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11"
      } ${on ? "text-rose-600 dark:text-rose-400" : "text-stone-400 hover:text-rose-500 dark:text-stone-500"}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden className={large ? "h-6 w-6" : "h-5 w-5"} fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M12 20.5s-7.5-4.6-9.3-9.3C1.4 7.8 3.6 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.6 3.3 4.3 6.7-1.8 4.7-9.3 9.3-9.3 9.3z" />
      </svg>
    </button>
  );
}

/** A small filled heart beside a name where it cannot be pressed (rankings, the map's tables). */
export function HeartMark() {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label="favourite" className="inline h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" fill="currentColor">
      <path d="M12 20.5s-7.5-4.6-9.3-9.3C1.4 7.8 3.6 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.6 3.3 4.3 6.7-1.8 4.7-9.3 9.3-9.3 9.3z" />
    </svg>
  );
}
