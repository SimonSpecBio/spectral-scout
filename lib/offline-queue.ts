// Offline capture queue -- originally scoped to just scouting/sampling
// sessions, trap readings, and treatments (the three types INSTALL_PWA.md's
// spec called out), extended to every field-capture form (facilities,
// areas, traps, pest/disease events, tasks) since there was no principled
// reason a new pest event should hard-fail offline while a scouting log
// silently queues -- both happen standing in the same greenhouse. Still not
// a generic wrapper for arbitrary mutations elsewhere in the app (e.g. team
// management, catalog edits), just every form whose job is capturing
// something in the field. Lives at the application layer (IndexedDB + an
// online-event listener) rather than intercepted inside the service
// worker's fetch handler: matching/replaying arbitrary POST bodies
// generically inside sw.js is harder to get right and to test than having
// each capture form itself decide "did this save, or does it need to
// queue" and reporting that back to the user -- which a bare fetch
// interception can't do (the UI would just see a successful-looking
// response with no way to say "this is still pending").
//
// IMPORTANT LIMITATION: this has only been exercised via `npm run build`
// (a type/syntax check) -- verifying the actual offline -> reconnect ->
// sync round trip requires a real browser with DevTools' network throttling
// or a physical device, which isn't available in this environment. Test it
// for real before relying on it in the field: submit a trap reading with
// the network tab set to "Offline," confirm the pending badge appears,
// go back online, confirm it syncs and the badge clears.
const DB_NAME = "spectral-scout-offline";
// v2 (ticket recAAWHkGTiiWDH5C): adds the FAILED_STORE -- a rejected item
// used to just be deleted, indistinguishable in the UI from one that
// synced. Bumping this runs onupgradeneeded for anyone still on v1, which
// only ever adds the new store; existing pending items are untouched.
const DB_VERSION = 2;
const STORE = "pending";
const FAILED_STORE = "failed";

interface PendingRequest {
  id: number;
  url: string;
  method: string;
  body: unknown;
  // A queued photo upload stores the raw File as `body` instead of a JSON
  // value (IndexedDB structured-clones Blob/File natively) and replays it
  // as multipart form data under `fileFieldName` instead of a JSON body.
  isFile?: boolean;
  fileFieldName?: string;
  // Extra plain-text fields sent alongside the file (e.g. a photo's
  // caption) -- appended to the same multipart form as the file itself,
  // both on the immediate-send path and on queued replay.
  extraFields?: Record<string, string>;
  createdAt: number;
  label: string; // human-readable, shown in the pending-sync indicator
}

// A pending item the server told us, unambiguously, it will never accept
// (validation, a since-deleted reference, a conflict) -- kept for the
// grower to see and re-enter by hand instead of silently vanishing, which
// is what happened before (ticket recAAWHkGTiiWDH5C: "everything synced"
// was reported even when a whole queue was quietly discarded).
export interface FailedRequest extends PendingRequest {
  failedStatus: number;
  failedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
      if (!req.result.objectStoreNames.contains(FAILED_STORE)) {
        req.result.createObjectStore(FAILED_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueue(
  url: string,
  method: string,
  body: unknown,
  label: string,
  isFile?: boolean,
  fileFieldName?: string,
  extraFields?: Record<string, string>
): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({ url, method, body, isFile, fileFieldName, extraFields, createdAt: Date.now(), label });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notifyChanged();
}

export async function getPending(): Promise<PendingRequest[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as PendingRequest[]);
    req.onerror = () => reject(req.error);
  });
}

async function removePending(id: number): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getFailed(): Promise<FailedRequest[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(FAILED_STORE, "readonly").objectStore(FAILED_STORE).getAll();
    req.onsuccess = () => resolve(req.result as FailedRequest[]);
    req.onerror = () => reject(req.error);
  });
}

// A grower dismissing a failed item after re-entering it by hand (or just
// deciding to drop it) -- the only way anything leaves FAILED_STORE, since
// nothing here retries automatically (the server already told us it never
// will).
export async function dismissFailed(id: number): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FAILED_STORE, "readwrite");
    tx.objectStore(FAILED_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notifyChanged();
}

// Moves one pending item to the failed store in a single pass (rather than
// a separate delete-then-add) so a crash between the two can't either
// duplicate it or drop it silently.
async function moveToFailed(item: PendingRequest, status: number): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE, FAILED_STORE], "readwrite");
    tx.objectStore(STORE).delete(item.id);
    // Carries its old pending-store id over as the failed-store id too --
    // fine to reuse: autoIncrement only fills in an id when one isn't
    // already present, and pending ids are never reused within a store's
    // lifetime, so this can never collide with another failed entry.
    tx.objectStore(FAILED_STORE).add({ ...item, failedStatus: status, failedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const CHANGE_EVENT = "spectral-offline-queue-changed";
function notifyChanged() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
export function onQueueChanged(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb);
  return () => window.removeEventListener(CHANGE_EVENT, cb);
}

// Fired when a flush hits a 401/403 -- the session itself is the problem,
// not any individual item, so every item still in the queue is left alone
// (not moved to failed) and this tells the UI to prompt a real sign-in
// instead. flushQueue already re-runs on the existing online/visibility/
// pageshow listeners, so signing back in and returning to the app is
// enough to pick the queue back up -- nothing here needs its own retry
// timer.
const AUTH_REQUIRED_EVENT = "spectral-offline-queue-auth-required";
function notifyAuthRequired() {
  window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
}
export function onAuthRequired(cb: () => void): () => void {
  window.addEventListener(AUTH_REQUIRED_EVENT, cb);
  return () => window.removeEventListener(AUTH_REQUIRED_EVENT, cb);
}

// Lets PwaRegister's controllerchange handler defer its forced reload while
// a capture form is mid-submit, instead of truncating it -- see that file's
// comment. Module-level count rather than a boolean: overlapping calls
// (a fast double-tap, or two forms submitting in different tabs sharing this
// module) must not have the first one's completion clear a still-in-flight
// second one.
let inFlightMutations = 0;
const MUTATION_EVENT = "spectral-mutation-inflight-changed";
export function isMutationInFlight(): boolean {
  return inFlightMutations > 0;
}
export function onMutationSettled(cb: () => void): () => void {
  window.addEventListener(MUTATION_EVENT, cb);
  return () => window.removeEventListener(MUTATION_EVENT, cb);
}

// Tries a real POST first. Only queues on an actual network failure (a
// thrown fetch error) or when the browser already knows it's offline --
// a real HTTP error response (validation, auth, 500) is returned as a
// failure instead, since retrying that later would never succeed and
// silently queuing it would hide a real problem from the person entering
// data right now.
// A tab backgrounded mid-request (switching apps on a phone mid-submit,
// ticket found in QA 2026-09-03: "Setting..." stuck for a long time, then
// stuck on "pending sync" after reopening) can leave the underlying fetch
// neither resolving nor rejecting for as long as the OS keeps the tab
// suspended -- no thrown error to fall into the queue path below, no
// response to return either, just an indefinitely hung await. Aborting
// after a generous timeout turns that hang into the same "queue it"
// outcome a real network failure already gets, instead of leaving the
// submit button reading "Setting..." forever.
const FETCH_TIMEOUT_MS = 20_000;

// A capture's real "when" is the moment this function is first called, not
// whenever the request finally lands server-side -- if it queues, that
// could be hours later, potentially past midnight (ticket recd05VrZFhxePhoi:
// a scouting session captured at 08:00 in a dead zone and synced at 17:00
// used to get stamped 17:00, and a session captured before midnight and
// synced after landed on the wrong day entirely). Computed once here, from
// getFullYear/getMonth/getDate (this DEVICE's own local calendar day, not
// UTC) rather than sliced from a UTC ISO string -- the same fix also
// resolves the separate always-online bug where a grower scouting late in
// the evening got tomorrow's UTC date. Only date-sensitive routes
// (scouting, monitoring, trap readings -- the ones whose "date" column
// feeds day-granularity trend/threshold math) read this; every other
// route ignores the extra field.
function capturedDateLocal(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Merges capturedDate (this device's local calendar day, for date-column
// routes like scouting/monitoring) and capturedAt (the exact moment, ISO,
// for a full timestamp column like trap readings' createdAt) into a JSON
// body without disturbing a non-object body (there are none today, but
// this stays defensive rather than assume). Both derived from the same
// Date instance so they can never disagree with each other.
function withCapturedDate(body: unknown): unknown {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return body;
  const now = new Date();
  return { ...body, capturedDate: capturedDateLocal(now), capturedAt: now.toISOString() };
}

export async function queuedFetch(
  url: string,
  body: unknown,
  label: string,
  method: string = "POST"
): Promise<{ ok: boolean; queued: boolean; data?: unknown }> {
  inFlightMutations++;
  const stampedBody = withCapturedDate(body);
  try {
    if (typeof navigator !== "undefined" && navigator.onLine) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stampedBody),
          signal: controller.signal,
        });
        if (res.ok) return { ok: true, queued: false, data: await res.json() };
        return { ok: false, queued: false };
      } catch {
        // network failure while the browser thought it was online (flaky
        // signal), or the timeout above firing -- fall through and queue
        // instead of surfacing an error.
      } finally {
        clearTimeout(timeoutId);
      }
    }
    await enqueue(url, method, stampedBody, label);
    return { ok: true, queued: true };
  } finally {
    inFlightMutations = Math.max(0, inFlightMutations - 1);
    window.dispatchEvent(new Event(MUTATION_EVENT));
  }
}

// Same contract as queuedFetch, for a file upload (multipart, not JSON) --
// a queued photo's File is stored as-is (IndexedDB structured-clones
// Blob/File) and replayed as form data on the next flush.
export async function queuedFileFetch(
  url: string,
  file: File,
  fieldName: string,
  label: string,
  extraFields?: Record<string, string>
): Promise<{ ok: boolean; queued: boolean; data?: unknown }> {
  inFlightMutations++;
  try {
    if (typeof navigator !== "undefined" && navigator.onLine) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const form = new FormData();
        form.append(fieldName, file);
        if (extraFields) for (const [k, v] of Object.entries(extraFields)) form.append(k, v);
        const res = await fetch(url, { method: "POST", body: form, signal: controller.signal });
        if (res.ok) return { ok: true, queued: false, data: await res.json() };
        return { ok: false, queued: false };
      } catch {
        // see queuedFetch above
      } finally {
        clearTimeout(timeoutId);
      }
    }
    await enqueue(url, "POST", file, label, true, fieldName, extraFields);
    return { ok: true, queued: true };
  } finally {
    inFlightMutations = Math.max(0, inFlightMutations - 1);
    window.dispatchEvent(new Event(MUTATION_EVENT));
  }
}

// Guards against two overlapping flush runs -- a flaky connection flapping
// online/offline/online in quick succession can fire the "online" listener
// twice before the first flush's async work finishes; without this, both
// runs would read the same pending items and could both successfully POST
// the same one, creating a duplicate row server-side. Module-level state is
// fine here (this file is a singleton per page, same as `initialized` below).
let flushing = false;

// Statuses where the server itself is telling us "not now, try again" --
// an expired/not-yet-valid session, a transient rate limit, a request that
// timed out server-side, or the server having a bad moment. None of these
// mean the DATA was invalid, only that this particular attempt was, so the
// item must survive to retry (ticket recAAWHkGTiiWDH5C -- these used to be
// deleted exactly like a genuine validation failure, and the realistic
// trigger is a session that expired while a scout worked offline for a
// couple hours: every queued item would 401 on reconnect and the whole
// queue vanished with the UI reporting success).
function isRetryableStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 408 || status === 429 || status >= 500;
}

export async function flushQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const pending = await getPending();
    for (const item of pending) {
      try {
        const method = item.method ?? "POST";
        let res: Response;
        if (item.isFile) {
          const form = new FormData();
          form.append(item.fileFieldName!, item.body as Blob);
          if (item.extraFields) for (const [k, v] of Object.entries(item.extraFields)) form.append(k, v);
          res = await fetch(item.url, { method, body: form });
        } else {
          res = await fetch(item.url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.body) });
        }
        if (res.ok) {
          await removePending(item.id);
          continue;
        }
        if (isRetryableStatus(res.status)) {
          // Leave this item (and everything queued after it, since replay
          // order matters and a session problem would 401 those too) for
          // the next flush rather than burning through the rest of the
          // queue against a session/server that just told us to back off.
          if (res.status === 401 || res.status === 403) notifyAuthRequired();
          break;
        }
        // A genuinely terminal response (400/404/409/422/...) -- retrying
        // this exact item would never succeed, but silently deleting it
        // hides real lost data from the person who entered it. Move it
        // where the grower can see it and re-enter by hand, and keep going
        // rather than letting one permanently-broken item (e.g. a since-
        // deleted area it referenced) block every item queued after it.
        await moveToFailed(item, res.status);
      } catch {
        // A thrown fetch error means the network itself is the problem --
        // stop here and retry the whole remaining queue on the next flush,
        // in original order.
        break;
      }
    }
    notifyChanged();
  } finally {
    flushing = false;
  }
}

let initialized = false;
// Called once from a mounted client component (OfflineQueueBadge), not at
// module load -- avoids double-binding the online listener across fast
// refresh / multiple imports.
export function initOfflineQueue(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  window.addEventListener("online", () => {
    flushQueue();
  });
  // A queued item from a backgrounded-mid-request hang (see FETCH_TIMEOUT_MS
  // above) has no real offline->online transition to retry it on -- the
  // network was never actually lost, so "online" never fires again. Retry
  // on the app coming back to the foreground too (tab switch, app switcher,
  // or a bfcache restore), which is exactly when a person would notice a
  // stuck "pending sync" badge and expect it to resolve itself.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") flushQueue();
  });
  window.addEventListener("pageshow", () => flushQueue());
  if (navigator.onLine) flushQueue();
}
