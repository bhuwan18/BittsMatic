export class CrazyGamesSDK {
  constructor() {
    this._sdk = null;
    this._initialized = false;
  }

  get available() {
    return typeof window !== "undefined" && !!window.CrazyGames?.SDK;
  }

  get initialized() {
    return this._initialized;
  }

  async init() {
    if (!this.available) return false;
    try {
      await window.CrazyGames.SDK.init();
      this._sdk = window.CrazyGames.SDK;
      this._initialized = true;
      return true;
    } catch {
      return false;
    }
  }

  async getUser() {
    if (!this._initialized) return null;
    try {
      return await this._sdk.user.getUser() ?? null;
    } catch {
      return null;
    }
  }

  async getUserId() {
    if (!this._initialized) return null;
    try {
      const token = await this._sdk.user.getUserToken();
      if (!token) return null;
      const [, payload] = token.split(".");
      if (!payload) return null;
      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
      const parsed = JSON.parse(atob(padded));
      return parsed.userId ?? null;
    } catch {
      return null;
    }
  }

  // Returns { locale, countryCode, ... } or null
  async getSystemInfo() {
    if (!this._initialized) return null;
    try {
      return await this._sdk.getSystemInfo() ?? null;
    } catch {
      return null;
    }
  }

  addAuthListener(callback) {
    if (!this._initialized) return;
    try { this._sdk.user.addAuthListener(callback); } catch {}
  }

  removeAuthListener(callback) {
    if (!this._initialized) return;
    try { this._sdk.user.removeAuthListener(callback); } catch {}
  }

  loadingStart() {
    if (!this._initialized) return;
    try { this._sdk.game.loadingStart(); } catch {}
  }

  loadingStop() {
    if (!this._initialized) return;
    try { this._sdk.game.loadingStop(); } catch {}
  }

  gameplayStart() {
    if (!this._initialized) return;
    try { this._sdk.game.gameplayStart(); } catch {}
  }

  gameplayStop() {
    if (!this._initialized) return;
    try { this._sdk.game.gameplayStop(); } catch {}
  }

  // Resolves when the ad finishes or errors (SDK manages the 3-min frequency cap).
  // Returns true if an ad actually played, false if it was skipped/errored.
  requestMidgameAd() {
    if (!this._initialized) return Promise.resolve(false);
    return new Promise((resolve) => {
      this._sdk.ad.requestAd("midgame", {
        adError: () => resolve(false),
        adStarted: () => {},
        adFinished: () => resolve(true)
      });
    });
  }
}
