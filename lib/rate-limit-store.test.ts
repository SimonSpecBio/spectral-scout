import { describe, expect, it } from "vitest";
import { consumeRateLimit, rateLimitKey } from "@/lib/rate-limit-store";

class SharedAtomicCounter {
  private count = 0;

  async increment() {
    // Yield before the increment so concurrent callers from independent
    // executor instances genuinely overlap rather than running serially.
    await Promise.resolve();
    this.count += 1;
    return { rows: [{ count: this.count }] };
  }
}

class FakeExecutor {
  constructor(private readonly store: SharedAtomicCounter) {}

  async execute() {
    return this.store.increment();
  }
}

describe("rateLimitKey", () => {
  it("does not persist the raw identifier and namespaces it by scope", () => {
    const first = rateLimitKey("auth.magic-link.email", " Grower@Example.com ");
    const same = rateLimitKey("auth.magic-link.email", "grower@example.com");
    const otherScope = rateLimitKey("demo.login.ip", "grower@example.com");
    expect(first).toBe(same);
    expect(first).not.toContain("grower@example.com");
    expect(first).not.toBe(otherScope);
  });
});

describe("consumeRateLimit", () => {
  it("shares one quota across independent server executors under concurrent pressure", async () => {
    const sharedStore = new SharedAtomicCounter();
    const serverA = new FakeExecutor(sharedStore);
    const serverB = new FakeExecutor(sharedStore);
    const now = new Date("2026-09-12T09:00:00.000Z");

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        consumeRateLimit("auth.magic-link.email", "grower@example.com", { limit: 3, windowMs: 15 * 60_000 }, {
          now,
          executor: index % 2 === 0 ? serverA : serverB,
        })
      )
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(3);
    expect(results.filter((result) => !result.allowed)).toHaveLength(9);
    expect(Math.max(...results.map((result) => result.count))).toBe(12);
  });

  it("returns a positive retry window when the quota is exhausted", async () => {
    const sharedStore = new SharedAtomicCounter();
    const executor = new FakeExecutor(sharedStore);
    const now = new Date("2026-09-12T09:07:30.000Z");

    await consumeRateLimit("demo.login.ip", "203.0.113.10", { limit: 1, windowMs: 15 * 60_000 }, { now, executor });
    const rejected = await consumeRateLimit("demo.login.ip", "203.0.113.10", { limit: 1, windowMs: 15 * 60_000 }, {
      now,
      executor,
    });

    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSeconds).toBe(450);
  });

  it("rejects invalid policy configuration instead of failing open", async () => {
    await expect(consumeRateLimit("test", "key", { limit: 0, windowMs: 1000 })).rejects.toThrow(/positive integer/);
    await expect(consumeRateLimit("test", "key", { limit: 1, windowMs: 0 })).rejects.toThrow(/window must be positive/);
  });
});
