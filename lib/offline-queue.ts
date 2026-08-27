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
const DB_VERSION = 1;
const STORE = "pending";

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
  createdAt: number;
  label: string; // human-readable, shown in the pending-sync indicator
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
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
  fileFieldName?: string
): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({ url, method, body, isFile, fileFieldName, createdAt: Date.now(), label });
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

const CHANGE_EVENT = "spectral-offline-queue-changed";
function notifyChanged() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
export function onQueueChanged(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb);
  return () => window.removeEventListener(CHANGE_EVENT, cb);
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
export async function queuedFetch(
  url: string,
  body: unknown,
  label: string,
  method: string = "POST"
): Promise<{ ok: boolean; queued: boolean; data?: unknown }> {
  inFlightMutations++;
  try {
    if (typeof navigator !== "undefined" && navigator.onLine) {
      try {
        const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (res.ok) return { ok: true, queued: false, data: await res.json() };
        return { ok: false, queued: false };
      } catch {
        // network failure while the browser thought it was online (flaky
        // signal) -- fall through and queue instead of surfacing an error.
      }
    }
    await enqueue(url, method, body, label);
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
  label: string
): Promise<{ ok: boolean; queued: boolean; data?: unknown }> {
  inFlightMutations++;
  try {
    if (typeof navigator !== "undefined" && navigator.onLine) {
      try {
        const form = new FormData();
        form.append(fieldName, file);
        const res = await fetch(url, { method: "POST", body: form });
        if (res.ok) return { ok: true, queued: false, data: await res.json() };
        return { ok: false, queued: false };
      } catch {
        // see queuedFetch above
      }
    }
    await enqueue(url, "POST", file, label, true, fieldName);
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
          res = await fetch(item.url, { method, body: form });
        } else {
          res = await fetch(item.url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.body) });
        }
        if (res.ok) {
          await removePending(item.id);
          continue;
        }
        // A real HTTP error response (the server is reachable) means retrying
        // this exact item later won't help -- same reasoning queuedFetch uses
        // to not queue these in the first place. Drop it and keep going,
        // rather than letting one permanently-broken item (e.g. a since-
        // deleted area it referenced) block every item queued after it on
        // every future flush.
        await removePending(item.id);
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
  if (navigator.onLine) flushQueue();
}
