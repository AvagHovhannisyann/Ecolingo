import { describe, expect, it } from "vitest";
import { mapAuthError, validateCredentials } from "../auth";

describe("validateCredentials", () => {
  it("accepts a normal email + 8-char password", () => {
    expect(validateCredentials("a@b.co", "12345678").ok).toBe(true);
    expect(validateCredentials("  padded@mail.org  ", "longenough").ok).toBe(true);
  });
  it("rejects malformed emails", () => {
    for (const bad of ["", "nope", "a@b", "a b@c.de", "@x.co", "a@.co"]) {
      expect(validateCredentials(bad, "12345678").ok, bad).toBe(false);
    }
  });
  it("rejects short passwords with a readable message", () => {
    const r = validateCredentials("a@b.co", "1234567");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/8 characters/);
  });
});

describe("mapAuthError", () => {
  it("maps duplicate-account errors to 'exists'", () => {
    expect(mapAuthError("User already registered").reason).toBe("exists");
    expect(mapAuthError("A user with this email address has already been registered").reason).toBe("exists");
  });
  it("maps bad credentials to 'invalid'", () => {
    expect(mapAuthError("Invalid login credentials").reason).toBe("invalid");
  });
  it("maps weak passwords to 'weak_password'", () => {
    expect(mapAuthError("Password should be at least 8 characters").reason).toBe("weak_password");
  });
  it("everything else degrades honestly without leaking internals", () => {
    const r = mapAuthError("fetch failed: ENOTFOUND supabase.co");
    expect(r.reason).toBe("error");
    expect(r.message).not.toMatch(/ENOTFOUND|supabase/);
    expect(r.message).toMatch(/safe on this device/);
  });
});
