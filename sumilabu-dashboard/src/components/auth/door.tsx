import type { ReactNode } from "react";

/**
 * The plain card the signed-out pages draw: the sign-in and the refusal. It
 * holds words only - no device, project, package or address - because these
 * are the two pages a stranger can see.
 */
export function Door({ title, children, testId }: { title: string; children: ReactNode; testId: string }) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f0e8_0%,#ece6dc_52%,#e1d8cb_100%)] px-4 text-stone-900">
      <main className="mx-auto mt-16 grid max-w-sm gap-3 rounded-2xl border border-stone-300/80 bg-white/90 p-5 shadow-sm" data-testid={testId}>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">SumiLabu</p>
        <h1 className="text-lg font-semibold">{title}</h1>
        {children}
      </main>
    </div>
  );
}
