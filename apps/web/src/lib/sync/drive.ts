import { buildSnapshot, mergeSnapshot, pruneTombstones, type Snapshot } from "./merge";

/**
 * Google Drive sync for the local-first Nöbet Çizelgesi DB.
 *
 * Auth uses the Google Identity Services token client (implicit grant) with the
 * `drive.appdata` scope only: data lives in the hidden app-data folder, invisible
 * in the user's normal Drive and never touching any server we run. The whole DB
 * is one snapshot file; a pull merges it into IndexedDB with last-writer-wins,
 * and React re-queries via Dexie's own change propagation — no page reload.
 *
 * iOS standalone / blocked popups fall back to a full-page redirect OAuth flow,
 * including a `state` CSRF check, because GIS's popup client strands those users.
 *
 * Requires a Google OAuth Client ID, persisted in localStorage so the user can
 * supply their own; the bundled default is already registered for this app's
 * origins.
 */

const LS_CLIENT_ID = "nobet_sync_client_id";
const LS_LAST_SYNC = "nobet_sync_last_sync";
const LS_AUTO = "nobet_sync_auto";
const LS_TOKEN = "nobet_sync_token";
const LS_AUTHORIZED = "nobet_sync_authorized";
const LS_MODE = "nobet_sync_mode"; // "popup" | "redirect"
const SS_STATE = "nobet_sync_oauth_state";

// Bundled default OAuth client, registered for this app's origins.
const DEFAULT_CLIENT_ID =
  "866965837196-pu23906a91os844d1g1k4gsqcesphcrt.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const SNAPSHOT_NAME = "nobet-data.json";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const PUSH_DEBOUNCE_MS = 5000;
const PULL_POLL_MS = 60000;
const TOKEN_SKEW_MS = 60_000;

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken: (opts?: { prompt?: string }) => void;
  callback: (resp: TokenResponse) => void;
  error_callback?: (err: { type?: string }) => void;
}

interface GisErrorCallback {
  type?: string;
}

/**
 * Shape of Google Identity Services we use. Cast from `window.google` (which may
 * be declared `any` elsewhere, or not at all once the legacy cloud-sync module
 * is removed) rather than augmenting the global, so this module is self-
 * contained and never conflicts with another `Window.google` declaration.
 */
interface GisGlobal {
  accounts?: {
    oauth2?: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (resp: TokenResponse) => void;
        error_callback?: (err: GisErrorCallback) => void;
      }) => TokenClient;
    };
  };
}

/** Typed view of `window.google`, or null when GIS is not loaded / unavailable. */
function getGis(): GisGlobal | null {
  if (!hasWindow()) return null;
  return (window.google as GisGlobal | undefined) ?? null;
}

export interface SyncState {
  configured: boolean;
  connected: boolean;
  lastSync: number | null;
  auto: boolean;
  status: string;
}

type Listener = (s: SyncState) => void;
type AuthMode = "popup" | "redirect";

const hasWindow = (): boolean => typeof window !== "undefined";

/** iOS in PWA/standalone mode can't use GIS popups reliably. */
function preferRedirect(): boolean {
  if (!hasWindow()) return false;
  try {
    const standalone =
      (window.matchMedia?.("(display-mode: standalone)").matches ?? false) ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const ios =
      /iP(hone|ad|od)/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    return standalone && ios;
  } catch {
    return false;
  }
}

function redirectUri(): string {
  return hasWindow() ? `${window.location.origin}/` : "";
}

function randomState(): string {
  try {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.from(a)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
}

class DriveSync {
  private tokenClient: TokenClient | null = null;
  private connectPromise: Promise<void> | null = null;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  private authMode: AuthMode = "popup";
  private gisLoaded = false;

  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pullTimer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private status = "";
  private listeners: Listener[] = [];

  constructor() {
    // Restore a still-valid token so a page reload doesn't force a new sign-in.
    try {
      const raw = localStorage.getItem(LS_TOKEN);
      if (raw) {
        const { token, exp } = JSON.parse(raw) as { token: string; exp: number };
        if (token) localStorage.setItem(LS_AUTHORIZED, "1");
        if (token && exp && Date.now() < exp) {
          this.accessToken = token;
          this.tokenExpiresAt = exp;
        }
      }
      const mode = localStorage.getItem(LS_MODE);
      if (mode === "popup" || mode === "redirect") this.authMode = mode;
    } catch {
      // ignore — no token to restore
    }
  }

  private persistToken(): void {
    if (this.accessToken && this.tokenExpiresAt > Date.now()) {
      localStorage.setItem(
        LS_TOKEN,
        JSON.stringify({ token: this.accessToken, exp: this.tokenExpiresAt }),
      );
      localStorage.setItem(LS_MODE, this.authMode);
    } else {
      localStorage.removeItem(LS_TOKEN);
    }
  }

  /**
   * Drop the token, stop timers and tell the UI to prompt for reconnect.
   * Used on 401 and on any path that finds the session gone. Never retries.
   */
  private expireSession(
    message = "Google oturumu sona erdi. Yeniden bağlanın.",
  ): void {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.persistToken();
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
    this.stopBackground();
    this.status = message;
    this.emit();
  }

  getClientId = (): string =>
    (hasWindow() && localStorage.getItem(LS_CLIENT_ID)) || DEFAULT_CLIENT_ID;

  setClientId = (id: string): void => {
    const previous = this.getClientId();
    if (id.trim()) localStorage.setItem(LS_CLIENT_ID, id.trim());
    else localStorage.removeItem(LS_CLIENT_ID);
    if (previous === this.getClientId()) {
      this.emit();
      return;
    }
    this.tokenClient = null;
    this.connectPromise = null;
    localStorage.removeItem(LS_AUTHORIZED);
    this.expireSession("Google hesabına yeniden bağlanın.");
  };

  private getLastSync = (): number | null => {
    if (!hasWindow()) return null;
    const v = localStorage.getItem(LS_LAST_SYNC);
    return v ? parseInt(v, 10) : null;
  };

  isAuto = (): boolean => (hasWindow() && localStorage.getItem(LS_AUTO)) === "1";

  setAuto = (on: boolean): void => {
    localStorage.setItem(LS_AUTO, on ? "1" : "0");
    if (on && this.isConnected()) {
      this.startBackground();
    } else {
      this.stopBackground();
      if (on) this.status = "Google oturumu gerekli. Senkron menüsünden bağlanın.";
    }
    this.emit();
  };

  onChange = (fn: Listener): (() => void) => {
    this.listeners.push(fn);
    fn(this.state());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  };

  private emit = (): void => {
    const s = this.state();
    this.listeners.forEach((l) => l(s));
  };

  state = (): SyncState => ({
    configured: !!this.getClientId(),
    connected: !!this.accessToken && Date.now() < this.tokenExpiresAt,
    lastSync: this.getLastSync(),
    auto: this.isAuto(),
    status: this.status,
  });

  // ---- GIS / token client -------------------------------------------------

  private loadGis(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!hasWindow()) return reject(new Error("Tarayıcı ortamı gerekli."));
      if (this.gisLoaded && getGis()?.accounts?.oauth2) return resolve();
      const existing = document.getElementById("gis-script");
      if (existing) {
        existing.addEventListener("load", () => {
          this.gisLoaded = true;
          resolve();
        });
        return;
      }
      const s = document.createElement("script");
      s.id = "gis-script";
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      s.onload = () => {
        this.gisLoaded = true;
        resolve();
      };
      s.onerror = () => reject(new Error("Google kimlik hizmeti yüklenemedi."));
      document.head.appendChild(s);
    });
  }

  private async ensureTokenClient(): Promise<TokenClient> {
    const clientId = this.getClientId();
    if (!clientId) throw new Error("Önce Google Client ID girin.");
    await this.loadGis();
    const gis = getGis();
    if (!this.tokenClient) {
      if (!gis?.accounts?.oauth2) {
        throw new Error("Google kimlik hizmeti yüklenemedi.");
      }
      this.tokenClient = gis.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: () => {},
      });
    }
    return this.tokenClient;
  }

  /** Popup token request; resolves/rejects when GIS fires its callback. */
  private requestPopupToken(prompt: "" | "consent"): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.ensureTokenClient()
        .then((client) => {
          client.callback = (resp: TokenResponse) => {
            if (resp.error) {
              reject(new Error(resp.error_description || resp.error));
              return;
            }
            this.applyToken(
              resp.access_token ?? null,
              resp.expires_in ? resp.expires_in * 1000 : 3_600_000,
            );
            this.authMode = "popup";
            resolve();
          };
          client.requestAccessToken({ prompt });
        })
        .catch(reject);
    });
  }

  private applyToken(token: string | null, expiresInMs: number): void {
    this.accessToken = token;
    this.tokenExpiresAt = Date.now() + expiresInMs - TOKEN_SKEW_MS;
    this.persistToken();
    localStorage.setItem(LS_AUTHORIZED, "1");
    this.emit();
  }

  // ---- Redirect-mode fallback --------------------------------------------

  private buildAuthUrl(silent: boolean): string {
    const state = randomState();
    try {
      sessionStorage.setItem(SS_STATE, state);
    } catch {
      // sessionStorage unavailable; CSRF check will be skipped on return
    }
    const params = new URLSearchParams({
      client_id: this.getClientId(),
      redirect_uri: redirectUri(),
      response_type: "token",
      scope: SCOPE,
      include_granted_scopes: "true",
      state,
    });
    if (silent) params.set("prompt", "none");
    return `${AUTH_ENDPOINT}?${params.toString()}`;
  }

  private startRedirectAuth(silent: boolean): void {
    if (!hasWindow()) return;
    this.authMode = "redirect";
    localStorage.setItem(LS_MODE, "redirect");
    window.location.href = this.buildAuthUrl(silent);
  }

  /**
   * Called from `init()` on boot. If the URL hash carries a redirect-flow
   * result, consume it, run the CSRF check and apply the token. Returns whether
   * a redirect result was present.
   */
  private consumeRedirectCallback(): boolean {
    if (!hasWindow()) return false;
    const hash = window.location.hash || "";
    if (hash.indexOf("access_token") === -1 && hash.indexOf("error=") === -1) {
      return false;
    }
    const frag = new URLSearchParams(hash.replace(/^#/, ""));
    const token = frag.get("access_token");
    const err = frag.get("error");
    const state = frag.get("state");

    let savedState: string | null = null;
    try {
      savedState = sessionStorage.getItem(SS_STATE);
      sessionStorage.removeItem(SS_STATE);
    } catch {
      // ignore
    }
    try {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    } catch {
      // ignore
    }

    if (err) {
      this.status = "Google ile giriş yapılamadı.";
      this.emit();
      return true;
    }
    if (!token) return true;
    if (savedState && state !== savedState) {
      // CSRF mismatch — do not apply the token.
      this.status = "Güvenlik doğrulaması başarısız, tekrar deneyin.";
      this.emit();
      return true;
    }

    const expiresIn = parseInt(frag.get("expires_in") || "3600", 10);
    this.applyToken(token, expiresIn * 1000);
    this.authMode = "redirect";
    return true;
  }

  // ---- Public auth API ----------------------------------------------------

  connect(): Promise<void> {
    if (this.isConnected()) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;

    // iOS standalone / known popup-hostile environments go straight to redirect.
    if (preferRedirect()) {
      this.startRedirectAuth(false);
      // Page navigates away; never resolve.
      return new Promise<void>(() => {});
    }

    const pending = new Promise<void>((resolve, reject) => {
      // If we've had a token before, try silent refresh first; only force the
      // consent screen on the very first connect.
      const previouslyAuthorized = localStorage.getItem(LS_AUTHORIZED) === "1";
      this.requestPopupToken(previouslyAuthorized ? "" : "consent")
        .then(() => {
          if (this.isAuto()) this.startBackground();
          resolve();
        })
        .catch((err: unknown) => {
          // Popup blocked or unsupported — fall back to full-page redirect.
          const type = (err as { type?: string })?.type;
          if (
            err instanceof Error &&
            (type === "popup_failed_to_open" || type === "unknown" ||
              /popup/i.test(err.message))
          ) {
            this.startRedirectAuth(false);
            return resolve();
          }
          reject(err instanceof Error ? err : new Error(String(err)));
        });
    }).finally(() => {
      this.connectPromise = null;
    });
    this.connectPromise = pending;
    return pending;
  }

  private async ensureToken(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) return;
    if (this.authMode === "redirect") {
      // Silent refresh via redirect unloads the page; only the explicit
      // connect() gesture should trigger that. Background work must not.
      throw new Error("Google oturumu sona erdi. Yeniden bağlanın.");
    }
    await this.connect();
  }

  isConnected(): boolean {
    return !!this.accessToken && Date.now() < this.tokenExpiresAt;
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.accessToken}` };
  }

  private async fetchWithAuth(
    url: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...((init.headers as Record<string, string> | undefined) ?? {}),
        ...this.authHeaders(),
      },
    });
    if (response.status === 401) {
      this.expireSession();
      throw new Error("Google oturumu sona erdi. Yeniden bağlanın.");
    }
    return response;
  }

  // ---- Snapshot file I/O --------------------------------------------------

  private async findSnapshotFile(): Promise<string | null> {
    const q = encodeURIComponent(`name='${SNAPSHOT_NAME}'`);
    const res = await this.fetchWithAuth(
      `${DRIVE_API}/files?q=${q}&spaces=appDataFolder&fields=files(id,name)`,
    );
    if (!res.ok) throw new Error(`Drive arama hatası (${res.status})`);
    const data = (await res.json()) as { files?: { id: string }[] };
    return data.files?.length ? data.files[0]!.id : null;
  }

  private async downloadSnapshot(fileId: string): Promise<Snapshot | null> {
    const res = await this.fetchWithAuth(
      `${DRIVE_API}/files/${fileId}?alt=media`,
    );
    if (!res.ok) throw new Error(`Snapshot indirilemedi (${res.status})`);
    return (await res.json()) as Snapshot;
  }

  private async uploadSnapshot(
    snapshot: Snapshot,
    existingId: string | null,
  ): Promise<void> {
    const metadata = existingId
      ? { name: SNAPSHOT_NAME }
      : { name: SNAPSHOT_NAME, parents: ["appDataFolder"] };
    const form = new FormData();
    form.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" }),
    );
    form.append(
      "file",
      new Blob([JSON.stringify(snapshot)], { type: "application/json" }),
    );
    const url = existingId
      ? `${DRIVE_UPLOAD}/files/${existingId}?uploadType=multipart&fields=id`
      : `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`;
    const res = await this.fetchWithAuth(url, {
      method: existingId ? "PATCH" : "POST",
      body: form,
    });
    if (!res.ok) throw new Error(`Snapshot yükleme hatası (${res.status})`);
  }

  // ---- Sync cycle ---------------------------------------------------------

  /** Pull remote, merge into local, then push the merged local back. */
  async syncNow(allowAuth = true): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    this.status = "Senkronize ediliyor…";
    this.emit();
    try {
      if (allowAuth) {
        await this.ensureToken();
      } else if (!this.isConnected()) {
        this.expireSession();
        return;
      }
      const fileId = await this.findSnapshotFile();
      if (fileId) {
        const remote = await this.downloadSnapshot(fileId);
        if (remote?.stores) await mergeSnapshot(remote);
      }
      await pruneTombstones();
      const merged = await buildSnapshot();
      await this.uploadSnapshot(merged, fileId);
      localStorage.setItem(LS_LAST_SYNC, String(Date.now()));
      this.status = "";
      // No reload: Dexie writes propagate to React via liveQuery. Listeners are
      // notified so any UI bound to SyncState (e.g. "last sync" label) refreshes.
      this.emit();
    } catch (err: unknown) {
      this.status = `Hata: ${err instanceof Error ? err.message : String(err)}`;
      this.emit();
      throw err;
    } finally {
      this.inFlight = false;
      this.emit();
    }
  }

  /**
   * Call after any local change. Debounced push. A no-op unless auto-sync is on,
   * a client ID is configured AND we are already connected — background work
   * must never open an auth popup, only an explicit user gesture may.
   */
  markDirty(): void {
    if (!this.isAuto() || !this.getClientId() || !this.isConnected()) return;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      void this.syncNow(false).catch(() => {
        // Status already set inside syncNow; swallow to keep the timer quiet.
      });
    }, PUSH_DEBOUNCE_MS);
  }

  private startBackground(): void {
    this.stopBackground();
    this.pullTimer = setInterval(() => {
      if (!this.isConnected()) {
        this.expireSession();
        return;
      }
      void this.syncNow(false).catch(() => {
        // Status already set inside syncNow.
      });
    }, PULL_POLL_MS);
  }

  private stopBackground(): void {
    if (this.pullTimer) {
      clearInterval(this.pullTimer);
      this.pullTimer = null;
    }
  }

  /**
   * Boot-time init. Reuses a valid saved token if present (popup mode), or
   * consumes a redirect-flow callback. Never opens auth UI from background work.
   * If auto-sync is on and the session is gone, sets a status telling the user
   * to reconnect from the menu.
   */
  async init(): Promise<void> {
    if (!hasWindow()) return;
    // Consume a returning redirect-flow auth first, if any.
    if (this.consumeRedirectCallback()) {
      if (this.isConnected() && this.isAuto()) {
        void this.syncNow(false).catch(() => {});
        this.startBackground();
      }
      return;
    }

    if (!this.isAuto() || !this.getClientId()) return;

    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      void this.syncNow(false).catch(() => {});
      this.startBackground();
      return;
    }

    this.expireSession("Google oturumu gerekli. Senkron menüsünden bağlanın.");
  }
}

export const driveSync = new DriveSync();
