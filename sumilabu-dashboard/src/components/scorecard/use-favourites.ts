"use client";

import { useCallback, useRef, useState } from "react";

/**
 * The hearts on the page (SUMILABU-9): changed at once, then saved. Presses
 * are sent one after another, so two quick ones cannot overwrite each other;
 * each answer is the list as stored, and a refused or failed save puts that
 * one heart back and says so. No polling: the list arrived with the page.
 */
export function useFavourites(initial: readonly string[]) {
  const [ids, setIds] = useState<Set<string>>(() => new Set(initial));
  const [message, setMessage] = useState<string | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  /* Presses not yet answered: an answer is the list as it was after its own press, so it is shown only when no later press is waiting. */
  const waiting = useRef(0);
  /* What the screen shows now, read at the press (a state updater may run later than the click). Written only here, with the state. */
  const shown = useRef<Set<string>>(new Set(initial));
  const show = useCallback((next: Set<string>) => {
    shown.current = next;
    setIds(next);
  }, []);

  const toggle = useCallback((id: string, name: string) => {
    const on = !shown.current.has(id);
    const pressed = new Set(shown.current);
    if (on) pressed.add(id);
    else pressed.delete(id);
    show(pressed);
    setMessage(null);
    waiting.current += 1;
    queue.current = queue.current.then(async () => {
      try {
        const res = await fetch("/packages/favourites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, on }), credentials: "same-origin" });
        const body = (await res.json().catch(() => null)) as { ok?: boolean; favourites?: string[] } | null;
        if (!res.ok || !body?.ok || !Array.isArray(body.favourites)) throw new Error(String(res.status));
        waiting.current -= 1;
        if (waiting.current === 0) show(new Set(body.favourites));
      } catch {
        waiting.current -= 1;
        const back = new Set(shown.current);
        if (on) back.delete(id);
        else back.add(id);
        show(back);
        setMessage(`Could not save the heart on ${name}. It is back as it was; try again.`);
      }
    });
  }, [show]);

  return { favourites: ids, toggle, message };
}
