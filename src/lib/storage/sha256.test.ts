// src/lib/storage/sha256.test.ts
//
// Unit tests for the SHA-256 helper. Verifies the known digest of
// empty + a fixed string + the format validator.

import { describe, it, expect } from "vitest";
import { sha256Hex, isValidSha256 } from "@/lib/storage/sha256";

describe("sha256Hex", () => {
  it("computes the SHA-256 of the empty string", () => {
    // Known: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(sha256Hex(new Uint8Array(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
  it("computes the SHA-256 of 'hello'", () => {
    // Known: 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(sha256Hex(new TextEncoder().encode("hello"))).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });
  it("is deterministic (same input → same digest)", () => {
    const buf = new TextEncoder().encode("TerraResponse AI");
    expect(sha256Hex(buf)).toBe(sha256Hex(buf));
  });
  it("returns a 64-char lowercase hex string", () => {
    const digest = sha256Hex(new Uint8Array([1, 2, 3]));
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("isValidSha256", () => {
  it("accepts a 64-char lowercase hex string", () => {
    expect(isValidSha256("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")).toBe(true);
  });
  it("rejects uppercase hex", () => {
    expect(isValidSha256("E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855")).toBe(false);
  });
  it("rejects a 63-char string", () => {
    expect(isValidSha256("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b85")).toBe(false);
  });
  it("rejects non-hex characters", () => {
    expect(isValidSha256("g3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")).toBe(false);
  });
  it("rejects empty", () => {
    expect(isValidSha256("")).toBe(false);
  });
});
