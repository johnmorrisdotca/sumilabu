import { describe, expect, it } from "vitest";

import { sameOriginWrite } from "./same-origin";

const h = (entries: Record<string, string>) => new Headers(entries);

describe("a write from this site's own page", () => {
  it("passes with an Origin naming the host it was sent to", () => {
    expect(sameOriginWrite(h({ origin: "https://app.sumilabu.com", host: "app.sumilabu.com", "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(sameOriginWrite(h({ origin: "http://localhost:6510", host: "localhost:6510" }))).toBe(true);
    expect(sameOriginWrite(h({ origin: "https://app.sumilabu.com", host: "internal", "x-forwarded-host": "app.sumilabu.com" }))).toBe(true);
  });

  it.each([
    ["no Origin", { host: "app.sumilabu.com" }],
    ["another site", { origin: "https://evil.example", host: "app.sumilabu.com" }],
    ["a sibling host", { origin: "https://sumilabu.com", host: "app.sumilabu.com" }],
    ["another port", { origin: "http://localhost:6511", host: "localhost:6510" }],
    ["a null Origin", { origin: "null", host: "app.sumilabu.com" }],
    ["a cross-site fetch", { origin: "https://app.sumilabu.com", host: "app.sumilabu.com", "sec-fetch-site": "cross-site" }],
    ["a same-site but other-origin fetch", { origin: "https://app.sumilabu.com", host: "app.sumilabu.com", "sec-fetch-site": "same-site" }],
  ])("refuses %s", (_label, headers) => {
    expect(sameOriginWrite(h(headers as Record<string, string>))).toBe(false);
  });
});
