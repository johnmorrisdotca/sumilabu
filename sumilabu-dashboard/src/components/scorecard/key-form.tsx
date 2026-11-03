/** The only thing /packages shows without a valid cookie. No data, no item names, nothing about what is behind it. */
export function KeyForm({ denied }: { denied: boolean }) {
  return (
    <form method="POST" action="/packages/session" className="mx-auto mt-16 grid max-w-sm gap-3 rounded-2xl border border-stone-300/80 bg-white/90 p-5 shadow-sm" data-testid="key-form">
      <h1 className="text-lg font-semibold">Private page</h1>
      <label className="grid gap-1 text-sm text-stone-700">
        View key
        <input
          type="password"
          name="key"
          autoComplete="current-password"
          required
          maxLength={200}
          className="rounded-full border border-stone-300 bg-white px-4 py-2 text-base outline-none focus:border-stone-600"
        />
      </label>
      {denied ? (
        <p role="alert" className="text-sm text-red-700">
          That key was not accepted.
        </p>
      ) : null}
      <button type="submit" className="rounded-full border border-stone-900 bg-stone-900 px-4 py-2 text-sm text-stone-50 hover:bg-stone-700">
        Open
      </button>
    </form>
  );
}
