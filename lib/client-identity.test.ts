import { beforeEach, describe, expect, it, vi } from "vitest";
import { getActiveIdentity, namespacedKey, onIdentityChanged, setActiveIdentity } from "./client-identity";

beforeEach(() => {
  setActiveIdentity(null);
});

describe("setActiveIdentity / getActiveIdentity", () => {
  it("normalizes empty, whitespace and undefined to null", () => {
    setActiveIdentity("");
    expect(getActiveIdentity()).toBeNull();
    setActiveIdentity("   ");
    expect(getActiveIdentity()).toBeNull();
    setActiveIdentity(undefined);
    expect(getActiveIdentity()).toBeNull();
  });

  it("trims a real id", () => {
    setActiveIdentity("  user-123  ");
    expect(getActiveIdentity()).toBe("user-123");
  });
});

describe("namespacedKey", () => {
  it("is distinct per identity so drafts never collide across accounts", () => {
    setActiveIdentity("userA");
    const a = namespacedKey("new-observation");
    setActiveIdentity("userB");
    const b = namespacedKey("new-observation");
    expect(a).not.toBe(b);
  });

  it("falls back to an anon bucket when no owner is known", () => {
    setActiveIdentity(null);
    expect(namespacedKey("draft")).toContain("anon");
  });

  it("is stable for the same identity", () => {
    setActiveIdentity("userA");
    expect(namespacedKey("draft")).toBe(namespacedKey("draft"));
  });
});

describe("onIdentityChanged", () => {
  it("fires only on an actual change and stops after unsubscribe", () => {
    const cb = vi.fn();
    const unsubscribe = onIdentityChanged(cb);

    setActiveIdentity("userA");
    expect(cb).toHaveBeenCalledTimes(1);

    setActiveIdentity("userA"); // same value -> no fire
    expect(cb).toHaveBeenCalledTimes(1);

    setActiveIdentity("userB");
    expect(cb).toHaveBeenCalledTimes(2);

    unsubscribe();
    setActiveIdentity("userC");
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
