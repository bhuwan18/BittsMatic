const CURRENT_USER_KEY = "bitts-matic.current-user";
const PROGRESS_PREFIX = "bitts-matic.progress.";

export class AuthSession {
  constructor({ storage = globalThis.localStorage } = {}) {
    this.storage = storage;
    this.user = this.#readCurrentUser();
  }

  isLoggedIn() {
    return Boolean(this.user?.id);
  }

  signInWithProfile(profile) {
    const user = sanitizeUser(profile);
    if (!user.id) throw new Error("Google profile is missing a user id.");
    this.user = user;
    this.storage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    return user;
  }

  signOut() {
    this.user = null;
    this.storage.removeItem(CURRENT_USER_KEY);
  }

  loadProgress() {
    if (!this.user?.id) return null;
    const raw = this.storage.getItem(`${PROGRESS_PREFIX}${this.user.id}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  saveProgress(progress) {
    if (!this.user?.id) return false;
    this.storage.setItem(`${PROGRESS_PREFIX}${this.user.id}`, JSON.stringify(progress));
    return true;
  }

  #readCurrentUser() {
    const raw = this.storage?.getItem?.(CURRENT_USER_KEY);
    if (!raw) return null;
    try {
      return sanitizeUser(JSON.parse(raw));
    } catch {
      return null;
    }
  }
}

export function profileFromGoogleCredential(credential) {
  const payload = decodeJwtPayload(credential);
  return sanitizeUser({
    id: payload.sub,
    name: payload.name,
    email: payload.email
  });
}

function sanitizeUser(profile) {
  return {
    id: String(profile?.id ?? profile?.sub ?? ""),
    name: String(profile?.name ?? profile?.displayName ?? "Player"),
    email: profile?.email ? String(profile.email) : ""
  };
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return {};
  const [, payload] = token.split(".");
  if (!payload) return {};
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const json = globalThis.atob
    ? globalThis.atob(padded)
    : Buffer.from(padded, "base64").toString("utf8");
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}
