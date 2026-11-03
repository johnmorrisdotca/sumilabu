import { describe, expect, it } from "vitest";

import { adminEmails, isAdminEmail } from "./admins";

const env = { SUMILABU_ADMIN_EMAILS: " John@spxis.com ,john@johnmorris.ca,, not-an-address " };

describe("SUMILABU_ADMIN_EMAILS", () => {
  it("is a comma list, trimmed and folded to lower case, dropping anything that is not an address", () => {
    expect([...adminEmails(env)]).toEqual(["john@spxis.com", "john@johnmorris.ca"]);
  });

  it("matches an address whatever its case", () => {
    expect(isAdminEmail("JOHN@SPXIS.COM", env)).toBe(true);
    expect(isAdminEmail("john@johnmorris.ca", env)).toBe(true);
  });

  it("refuses everyone else, and anything that is not a string", () => {
    for (const email of ["someone@spxis.com", "john@spxis.com.evil.example", "", null, undefined, 42, ["john@spxis.com"]]) {
      expect(isAdminEmail(email, env)).toBe(false);
    }
  });

  it("lets nobody in when unset or empty", () => {
    expect(isAdminEmail("john@spxis.com", {})).toBe(false);
    expect(isAdminEmail("john@spxis.com", { SUMILABU_ADMIN_EMAILS: "" })).toBe(false);
  });
});
