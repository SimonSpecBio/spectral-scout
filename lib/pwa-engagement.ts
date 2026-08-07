// Gates the install prompt on "the user has done something real" rather
// than showing it cold on first paint (INSTALL_PWA.md ยง5: "a user who's
// seen value installs; a cold prompt gets dismissed"). Called from the
// handful of primary creation flows' success paths (new pest/disease
// event, scouting log, trap reading, treatment) -- not every mutation in
// the app, just the ones that mean someone actually used the tool.
const KEY = "spectral-has-engaged";

export function markEngaged(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* storage unavailable (private browsing etc) -- the install prompt just won't show, not worth failing over */
  }
}

export function hasEngaged(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
