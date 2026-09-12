import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adoptOrphans,
  discardOrphans,
  dismissFailed,
  flushQueue,
  getFailed,
  getOrphanCount,
  getPending,
  isRetryableStatus,
  onAuthRequired,
  queuedFetch,
} from "./offline-queue";
import { setActiveIdentity } from "./client-identity";

// The real API always answers with application/json (NextResponse.json), which
// is the signal Task 761's acknowledgement check keys off to tell a committed
// write apart from an HTML shell or a sign-in redirect served as a 200. A bare
// `new Response(string)` defaults to text/plain, so success mocks must set the
// header to look like the real server.
function jsonRes(body: unknown, status = 200): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function htmlRes(status = 200): Response {
  return new Response("<!doctype html><title>Sign in</title>", { status, headers: { "content-type": "text/html" } });
}

// A field tool used in greenhouse dead zones lives or dies on this file
// never silently losing or duplicating a submission. Its own top-of-file
// comment flags it as "only exercised via npm run build" -- this is the
// first time the actual queue/flush logic has run at all, without needing
// a real browser or device (0.4/real-device QA still covers the parts this
// can't: OS-suspended tabs, iOS Safari evicting IndexedDB, a service
// worker serving a stale shell).

// The module under test has no way to clear its own IndexedDB store (by
// design -- nothing in the real app ever needs to, and every openDB() call
// it makes deliberately never closes the connection since a real page
// doesn't need to either), so tests reach past the public API here to
// reset storage between runs. Clearing the stores in place rather than
// indexedDB.deleteDatabase() -- delete requires exclusive access and
// BLOCKS forever behind the previous test's still-open connection (proved
// by hand: it hangs the very next test's own openDB() call, queued behind
// a delete that never completes). Names match offline-queue.ts's own
// DB_NAME/STORE/FAILED_STORE constants.
function resetDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("spectral-scout-offline", 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("pending")) req.result.createObjectStore("pending", { keyPath: "id", autoIncrement: true });
      if (!req.result.objectStoreNames.contains("failed")) req.result.createObjectStore("failed", { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(["pending", "failed"], "readwrite");
      tx.objectStore("pending").clear();
      tx.objectStore("failed").clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
    req.onerror = () => reject(req.error);
  });
}

// Adds a raw item with NO identity field -- simulates a queued capture left by
// an app version from before per-identity namespacing (Task 763).
function addLegacyPending(item: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("spectral-scout-offline", 2);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("pending", "readwrite");
      tx.objectStore("pending").add(item);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
    req.onerror = () => reject(req.error);
  });
}

beforeEach(async () => {
  await resetDatabase();
  setActiveIdentity(null); // start each test with no owner (matches pre-763 behavior)
  vi.stubGlobal("fetch", vi.fn());
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isRetryableStatus", () => {
  it("treats session/rate-limit/timeout/server statuses as retryable", () => {
    for (const status of [401, 403, 408, 429, 500, 503]) expect(isRetryableStatus(status)).toBe(true);
  });
  it("treats a genuine client error as terminal, not retryable", () => {
    for (const status of [400, 404, 409, 422]) expect(isRetryableStatus(status)).toBe(false);
  });
});

describe("queuedFetch", () => {
  it("succeeds immediately online -- nothing is queued", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonRes({ id: "1" }));
    const result = await queuedFetch("/api/x", { a: 1 }, "Test");
    expect(result).toEqual({ ok: true, queued: false, data: { id: "1" } });
    expect(await getPending()).toHaveLength(0);
  });

  it("queues on a genuine network failure (thrown fetch error), not a real HTTP error response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await queuedFetch("/api/x", { a: 1 }, "Test");
    expect(result).toEqual({ ok: true, queued: true });
    const pending = await getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].url).toBe("/api/x");
  });

  it("queues immediately when the browser already knows it's offline, without even trying fetch", async () => {
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    const result = await queuedFetch("/api/x", { a: 1 }, "Test");
    expect(result).toEqual({ ok: true, queued: true });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does NOT queue a real HTTP error response -- that would hide a real problem, not retry it", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(JSON.stringify({ error: "bad" }), { status: 422 }));
    const result = await queuedFetch("/api/x", { a: 1 }, "Test");
    expect(result).toEqual({ ok: false, queued: false });
    expect(await getPending()).toHaveLength(0);
  });

  it("stamps a stable clientRequestId onto the body that survives into the queued item unchanged", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("offline"));
    await queuedFetch("/api/x", { a: 1 }, "Test");
    const pending = await getPending();
    const body = pending[0].body as { clientRequestId: string };
    expect(typeof body.clientRequestId).toBe("string");
    expect(body.clientRequestId.length).toBeGreaterThan(10);
  });
});

describe("flushQueue", () => {
  it("removes a pending item once it replays successfully", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError("offline"));
    await queuedFetch("/api/x", { a: 1 }, "Test");
    expect(await getPending()).toHaveLength(1);

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonRes({}));
    await flushQueue();
    expect(await getPending()).toHaveLength(0);
  });

  it("replays the EXACT same clientRequestId on flush -- a stable id across the offline->online replay", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError("offline"));
    await queuedFetch("/api/x", { a: 1 }, "Test");
    const queuedBody = (await getPending())[0].body as { clientRequestId: string };

    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonRes({}));
    await flushQueue();

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sentBody.clientRequestId).toBe(queuedBody.clientRequestId);
  });

  it("leaves a retryable failure (401) in the queue and fires the auth-required event, instead of deleting it", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError("offline"));
    await queuedFetch("/api/x", { a: 1 }, "Test");

    const authRequired = vi.fn();
    const unsubscribe = onAuthRequired(authRequired);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("{}", { status: 401 }));
    await flushQueue();

    expect(await getPending()).toHaveLength(1); // still there, not deleted
    expect(authRequired).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("moves a terminal failure (422) to the failed store, visible for the grower to re-enter, not silently dropped", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError("offline"));
    await queuedFetch("/api/x", { a: 1 }, "Test");

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("{}", { status: 422 }));
    await flushQueue();

    expect(await getPending()).toHaveLength(0);
    const failed = await getFailed();
    expect(failed).toHaveLength(1);
    expect(failed[0].failedStatus).toBe(422);

    await dismissFailed(failed[0].id);
    expect(await getFailed()).toHaveLength(0);
  });

  it("stops at the first item on a thrown network error, leaving the rest of the queue for the next flush in order", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError("offline"));
    await queuedFetch("/api/first", { a: 1 }, "First");
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError("offline"));
    await queuedFetch("/api/second", { a: 2 }, "Second");
    expect(await getPending()).toHaveLength(2);

    // Flush hits a network error on the very first item.
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("Failed to fetch"));
    await flushQueue();
    const stillPending = await getPending();
    expect(stillPending).toHaveLength(2); // both untouched, original order preserved
    expect(stillPending[0].url).toBe("/api/first");
  });
});

// Task 761: a 2xx is not proof of a commit. These cover the failure modes a
// bare res.ok check let through -- an HTML app shell, a sign-in/onboarding
// redirect served as 200, malformed JSON, and a payload for a different
// request -- none of which may ever clear pending field work.
describe("validated acknowledgement (Task 761)", () => {
  it("online: a 200 HTML app shell is not a commit -- capture is queued, not reported committed", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(htmlRes(200));
    const result = await queuedFetch("/api/x", { a: 1 }, "Test");
    expect(result.queued).toBe(true);
    expect(result.data).toBeUndefined();
    expect(await getPending()).toHaveLength(1);
  });

  it("online: a 200 sign-in/onboarding page raises auth-needed and preserves the capture", async () => {
    const authRequired = vi.fn();
    const unsubscribe = onAuthRequired(authRequired);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(htmlRes(200));
    const result = await queuedFetch("/api/x", { a: 1 }, "Test");
    expect(result.authRequired).toBe(true);
    expect(authRequired).toHaveBeenCalledTimes(1);
    expect(await getPending()).toHaveLength(1);
    unsubscribe();
  });

  it("online: malformed JSON on a 200 is not a commit -- capture is queued", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("{not valid json", { status: 200, headers: { "content-type": "application/json" } })
    );
    const result = await queuedFetch("/api/x", { a: 1 }, "Test");
    expect(result.queued).toBe(true);
    expect(result.data).toBeUndefined();
    expect(await getPending()).toHaveLength(1);
  });

  it("flush: a 200 HTML shell never deletes the queued item (the data-loss bug)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError("offline"));
    await queuedFetch("/api/x", { a: 1 }, "Test");
    expect(await getPending()).toHaveLength(1);

    const authRequired = vi.fn();
    const unsubscribe = onAuthRequired(authRequired);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(htmlRes(200));
    await flushQueue();

    expect(await getPending()).toHaveLength(1); // preserved, not deleted
    expect(await getFailed()).toHaveLength(0); // and not misclassified as failed
    expect(authRequired).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("flush: a transient 5xx leaves the item queued to retry", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError("offline"));
    await queuedFetch("/api/x", { a: 1 }, "Test");
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("{}", { status: 503 }));
    await flushQueue();
    expect(await getPending()).toHaveLength(1);
    expect(await getFailed()).toHaveLength(0);
  });

  it("flush: a committed JSON acknowledgement clears the item", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError("offline"));
    await queuedFetch("/api/x", { a: 1 }, "Test");
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonRes({ id: "row-1" }));
    await flushQueue();
    expect(await getPending()).toHaveLength(0);
  });

  it("a successful server commit whose client response was lost replays and clears exactly once", async () => {
    // First attempt commits server-side but the client never sees the response
    // (network drop / timeout -> thrown) -> queued with a stable clientRequestId.
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError("connection lost"));
    await queuedFetch("/api/x", { a: 1 }, "Test");
    const queued = await getPending();
    expect(queued).toHaveLength(1);
    const clientRequestId = (queued[0].body as { clientRequestId: string }).clientRequestId;

    // Replay: the server recognizes the same clientRequestId and idempotently
    // returns the committed row (echoing the id back). Two flushes must not
    // duplicate work -- the second finds nothing left to do.
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonRes({ id: "row-1", clientRequestId }));
    await flushQueue();
    expect(await getPending()).toHaveLength(0);
    await flushQueue();
    expect(await getPending()).toHaveLength(0);
  });

  it("flush: a JSON payload echoing a DIFFERENT clientRequestId is rejected, not treated as this item's commit", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError("offline"));
    await queuedFetch("/api/x", { a: 1 }, "Test");
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonRes({ id: "z", clientRequestId: "some-other-request" }));
    await flushQueue();
    // Not a commit for this item -> preserved (never deleted on a mismatched ack).
    expect(await getPending()).toHaveLength(1);
    expect(await getFailed()).toHaveLength(0);
  });
});

// Task 763: browser-local work is owned by the signed-in identity. On a shared
// device, an account switch must never surface or replay the previous user's
// captures, and the same user's pending work must survive re-authentication.
describe("per-identity namespacing (Task 763)", () => {
  it("scopes pending work to the signed-in identity across an account switch", async () => {
    setActiveIdentity("userA");
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError("offline"));
    await queuedFetch("/api/x", { a: 1 }, "A capture");
    expect(await getPending()).toHaveLength(1);

    // Switch to a different account -> the first account's work is invisible.
    setActiveIdentity("userB");
    expect(await getPending()).toHaveLength(0);
    expect(await getFailed()).toHaveLength(0);

    // The original user signs back in -> their pending work is preserved.
    setActiveIdentity("userA");
    const pending = await getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].url).toBe("/api/x");
  });

  it("never replays one account's queued item while a different account is signed in", async () => {
    setActiveIdentity("userA");
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError("offline"));
    await queuedFetch("/api/x", { a: 1 }, "A capture");

    // As userB, a flush must not touch userA's item -- so fetch is never called.
    // (Clear the mock first: the offline capture above already recorded one
    // rejected fetch attempt.)
    setActiveIdentity("userB");
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonRes({ id: "committed" }));
    fetchMock.mockClear();
    await flushQueue();
    expect(fetchMock).not.toHaveBeenCalled();

    // userA's item is intact and replays normally once they are back.
    setActiveIdentity("userA");
    await flushQueue();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await getPending()).toHaveLength(0);
  });

  it("keeps a captured body from being replayed under another identity", async () => {
    setActiveIdentity("userA");
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError("offline"));
    await queuedFetch("/api/x", { secret: "A's data" }, "A capture");

    // userB flushes -> nothing sent, so A's body can never reach the server as B.
    setActiveIdentity("userB");
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonRes({ id: "committed" }));
    fetchMock.mockClear(); // ignore the rejected attempt from the offline capture above
    await flushQueue();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("legacy orphan recovery", () => {
    it("does not surface or replay unowned legacy items, but exposes them for recovery", async () => {
      await addLegacyPending({ url: "/api/legacy", method: "POST", body: { a: 1 }, createdAt: Date.now(), label: "Legacy" });
      setActiveIdentity("userA");

      // Not owned by anyone provable -> invisible to the normal queue...
      expect(await getPending()).toHaveLength(0);
      // ...but offered for explicit recovery.
      expect(await getOrphanCount()).toBe(1);
    });

    it("adopts orphans into the current identity so they sync as that user", async () => {
      await addLegacyPending({ url: "/api/legacy", method: "POST", body: { a: 1 }, createdAt: Date.now(), label: "Legacy" });
      setActiveIdentity("userA");

      await adoptOrphans();
      expect(await getOrphanCount()).toBe(0);
      const pending = await getPending();
      expect(pending).toHaveLength(1);
      expect(pending[0].url).toBe("/api/legacy");
    });

    it("discards orphans when the user chooses not to claim them", async () => {
      await addLegacyPending({ url: "/api/legacy", method: "POST", body: { a: 1 }, createdAt: Date.now(), label: "Legacy" });
      setActiveIdentity("userA");

      await discardOrphans();
      expect(await getOrphanCount()).toBe(0);
      expect(await getPending()).toHaveLength(0);
    });
  });
});
