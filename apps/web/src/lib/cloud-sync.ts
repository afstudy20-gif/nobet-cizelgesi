/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
"use client";

// Client-side Google Drive Synchronization for Nöbet Çizelgesi.
// Modeled after notepad's cloud-sync.js

declare global {
  interface Window {
    google: any;
    __nobetCloud: any;
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '866965837196-e30js8ltie1pirn0ohuv3is2uhcecmd3.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

// Sync configuration
const PUSH_DEBOUNCE_MS = 10000;
const PULL_INTERVAL_MS = 60000;

// LocalStorage Keys
const LS_TOKEN = 'nobet_cloud_token';
const LS_USER = 'nobet_cloud_user';
const LS_LAST_SYNC = 'nobet_cloud_last_sync';
const LS_MODE = 'nobet_cloud_mode'; // 'popup' | 'redirect'
const LS_LAST_MODIFIED = 'nobet_db_last_modified';
const SS_STATE = 'nobet_oauth_state';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

// State
let tokenClient: any = null;
let accessToken: string | null = null;
let tokenExpiresAt = 0;
let userInfo: any = null;
let signedIn = false;
let authMode: 'popup' | 'redirect' = 'popup';
let status: 'idle' | 'syncing' | 'ok' | 'error' | 'setupNeeded' = 'idle';
let statusMsg = '';
let pushTimer: any = null;
let pullTimer: any = null;
let initialized = false;
let listeners: Array<(status: any) => void> = [];
let inFlight = false;

// Platform detection
function isStandalone() {
  if (typeof window === 'undefined') return false;
  try {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
           (window.navigator as any).standalone === true;
  } catch { return false; }
}

function isIOS() {
  if (typeof window === 'undefined') return false;
  return /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function gisAvailable() {
  if (typeof window === 'undefined') return false;
  return !!(window.google && window.google.accounts && window.google.accounts.oauth2);
}

function preferRedirect() {
  if (isStandalone() && isIOS()) return true;
  return false;
}

function redirectUri() {
  if (typeof window === 'undefined') return '';
  return window.location.origin + '/';
}

function randomState() {
  try {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
}

// Listeners
function emit() {
  const currentStatus = getStatus();
  for (const fn of listeners) {
    try { fn(currentStatus); } catch (e) { console.warn('[cloud] listener error', e); }
  }
}

export function onChange(fn: (status: any) => void) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter(x => x !== fn);
  };
}

function setStatus(s: typeof status, msg?: string) {
  status = s;
  statusMsg = msg || '';
  emit();
}

export function getStatus() {
  if (typeof window === 'undefined') {
    return { signedIn: false, status: 'idle', message: '', user: null, lastSync: null };
  }
  return {
    signedIn,
    status,
    message: statusMsg,
    user: userInfo,
    lastSync: parseInt(localStorage.getItem(LS_LAST_SYNC) || '0', 10) || null,
  };
}

// Token persistence
function persistToken() {
  if (accessToken && tokenExpiresAt > Date.now()) {
    localStorage.setItem(LS_TOKEN, JSON.stringify({ t: accessToken, e: tokenExpiresAt }));
    localStorage.setItem(LS_MODE, authMode);
  } else {
    localStorage.removeItem(LS_TOKEN);
  }
}

function restoreToken() {
  try {
    const raw = localStorage.getItem(LS_TOKEN);
    if (!raw) return false;
    const { t, e } = JSON.parse(raw);
    if (!t || !e || e <= Date.now() + 60000) return false;
    accessToken = t;
    tokenExpiresAt = e;
    const m = localStorage.getItem(LS_MODE);
    if (m === 'popup' || m === 'redirect') authMode = m;
    return true;
  } catch { return false; }
}

function restoreUser() {
  try {
    const raw = localStorage.getItem(LS_USER);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

// GIS client init
function ensureGISLoaded(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('Server-side'));
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      resolve();
      return;
    }
    let waited = 0;
    const poll = setInterval(() => {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        clearInterval(poll);
        resolve();
      } else if ((waited += 100) > 10000) {
        clearInterval(poll);
        reject(new Error('GIS client failed to load'));
      }
    }, 100);
  });
}

async function initTokenClient() {
  await ensureGISLoaded();
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (resp: any) => {
      if (resp.error) {
        console.error('[cloud] token error', resp);
        setStatus('error', resp.error_description || resp.error);
        signedIn = false;
        return;
      }
      accessToken = resp.access_token;
      tokenExpiresAt = Date.now() + (resp.expires_in - 60) * 1000;
      signedIn = true;
      authMode = 'popup';
      persistToken();
      fetchUserInfo().then(() => {
        setStatus('syncing', 'Senkronizasyon yapılıyor...');
        syncNow().catch((e) => setStatus('error', e.message));
        startBackgroundPull();
      });
    },
    error_callback: (err: any) => {
      console.warn('[cloud] GIS error', err);
      if (err && (err.type === 'popup_failed_to_open' || err.type === 'unknown')) {
        startRedirectAuth(false);
      } else {
        setStatus('idle', err && err.type === 'popup_closed' ? '' : (err && err.type) || 'Kimlik doğrulama iptal edildi');
      }
    },
  });
}

async function fetchUserInfo() {
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + accessToken },
    });
    if (r.ok) {
      userInfo = await r.json();
      localStorage.setItem(LS_USER, JSON.stringify(userInfo));
      return;
    }
  } catch (e) {
    console.warn('[cloud] userinfo fetch failed, trying Drive fallback', e);
  }

  try {
    const r = await driveFetch('/about?fields=user');
    const data = await r.json();
    if (data && data.user) {
      userInfo = {
        email: data.user.emailAddress,
        name: data.user.displayName,
        picture: data.user.photoLink
      };
      localStorage.setItem(LS_USER, JSON.stringify(userInfo));
    }
  } catch (e) {
    console.warn('[cloud] userinfo fallback failed', e);
  }
}

// Redirect Auth Flow
function buildAuthUrl(silent: boolean) {
  const state = randomState();
  try { sessionStorage.setItem(SS_STATE, state); } catch (_) {}
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPE,
    include_granted_scopes: 'true',
    state: state,
  });
  if (silent) params.set('prompt', 'none');
  if (userInfo && userInfo.email) params.set('login_hint', userInfo.email);
  return AUTH_ENDPOINT + '?' + params.toString();
}

function startRedirectAuth(silent: boolean) {
  if (!CLIENT_ID) { setStatus('setupNeeded', ''); return; }
  authMode = 'redirect';
  localStorage.setItem(LS_MODE, 'redirect');
  window.location.href = buildAuthUrl(!!silent);
}

function handleRedirectCallback() {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  if (hash.indexOf('access_token') === -1 && hash.indexOf('error=') === -1) return null;
  const frag = new URLSearchParams(hash.replace(/^#/, ''));
  const token = frag.get('access_token');
  const err = frag.get('error');
  const state = frag.get('state');
  let savedState: string | null = null;
  try {
    savedState = sessionStorage.getItem(SS_STATE);
    sessionStorage.removeItem(SS_STATE);
  } catch (_) {}
  
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch (_) {}

  if (err) {
    console.warn('[cloud] redirect auth error:', err);
    return 'error';
  }
  if (!token) return 'error';
  if (savedState && state !== savedState) {
    console.warn('[cloud] OAuth CSRF check failed, state mismatch');
    return 'error';
  }

  const expiresIn = parseInt(frag.get('expires_in') || '3600', 10);
  accessToken = token;
  tokenExpiresAt = Date.now() + (expiresIn - 60) * 1000;
  signedIn = true;
  authMode = 'redirect';
  persistToken();
  return 'ok';
}

// Sign In / Out APIs
export async function signIn() {
  if (!CLIENT_ID) {
    setStatus('setupNeeded', 'Google Client ID yapılandırılmadı.');
    return;
  }
  if (preferRedirect()) {
    startRedirectAuth(false);
    return;
  }
  try {
    if (!tokenClient) await initTokenClient();
    tokenClient.requestAccessToken({ prompt: signedIn ? '' : 'consent' });
  } catch (e) {
    console.warn('[cloud] popup auth blocked/unsupported, trying redirect', e);
    startRedirectAuth(false);
  }
}

export async function signOut() {
  if (accessToken && window.google && window.google.accounts && window.google.accounts.oauth2) {
    try { window.google.accounts.oauth2.revoke(accessToken, () => {}); } catch (_) {}
  }
  accessToken = null;
  tokenExpiresAt = 0;
  signedIn = false;
  userInfo = null;
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_USER);
  localStorage.removeItem(LS_MODE);
  localStorage.removeItem(LS_LAST_SYNC);
  localStorage.removeItem(LS_LAST_MODIFIED);
  clearTimeout(pushTimer);
  clearInterval(pullTimer);
  pullTimer = null;
  setStatus('idle', '');
}

async function refreshToken() {
  if (authMode === 'redirect') {
    startRedirectAuth(true);
    await new Promise(() => {}); // Halt execution while page unloads
    return;
  }
  if (!gisAvailable()) throw new Error('Token expired and Google API unavailable');
  if (!tokenClient) await initTokenClient();
  await new Promise<void>((resolve, reject) => {
    const prev = tokenClient.callback;
    const timeoutId = setTimeout(() => {
      tokenClient.callback = prev;
      reject(new Error('Sessiz token yenileme zaman aşımına uğradı.'));
    }, 5000);

    tokenClient.callback = (resp: any) => {
      clearTimeout(timeoutId);
      tokenClient.callback = prev;
      if (resp.error) { reject(new Error(resp.error)); return; }
      accessToken = resp.access_token;
      tokenExpiresAt = Date.now() + (resp.expires_in - 60) * 1000;
      authMode = 'popup';
      persistToken();
      resolve();
    };
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

// Drive Fetch Helper
async function driveFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!accessToken) throw new Error('No access token');
  if (tokenExpiresAt && tokenExpiresAt <= Date.now()) {
    await refreshToken();
  }
  const opts = init || {};
  opts.headers = Object.assign({}, opts.headers || {}, {
    Authorization: 'Bearer ' + accessToken,
  });
  const url = path.startsWith('http') ? path : (DRIVE_API + path);
  let r = await fetch(url, opts);
  if (r.status === 401) {
    try {
      await refreshToken();
      (opts.headers as any).Authorization = 'Bearer ' + accessToken;
      r = await fetch(url, opts);
    } catch (e) {
      signedIn = false;
      localStorage.removeItem(LS_TOKEN);
      setStatus('idle', 'Yeniden giriş yapılması gerekiyor');
      throw new Error('Oturum süresi doldu, yeniden giriş gerekli.');
    }
  }
  if (!r.ok) {
    const errText = await r.text().catch(() => '');
    throw new Error(`Google Drive API Hatası (${r.status}): ${errText.slice(0, 200)}`);
  }
  return r;
}

// Drive REST File Interactions
async function listAppData() {
  const r = await driveFetch('/files?spaces=appDataFolder&fields=files(id,name,modifiedTime,size)&pageSize=100');
  const data = await r.json();
  return data.files || [];
}

async function downloadJson(fileId: string) {
  const r = await driveFetch(`/files/${fileId}?alt=media`);
  return await r.json();
}

async function uploadJson(name: string, json: any, existingFileId?: string | null) {
  const meta = existingFileId
    ? { name }
    : { name, parents: ['appDataFolder'], mimeType: 'application/json' };
  const boundary = '-------NobetCloud' + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(meta) + `\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    JSON.stringify(json) + `\r\n` +
    `--${boundary}--`;
  const path = existingFileId
    ? `${DRIVE_UPLOAD}/files/${existingFileId}?uploadType=multipart`
    : `${DRIVE_UPLOAD}/files?uploadType=multipart`;
  const r = await driveFetch(path, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return await r.json();
}

// Sync Pull/Push Logic
async function getLocalDatabaseModifiedTime(): Promise<number> {
  const clientModified = parseInt(localStorage.getItem(LS_LAST_MODIFIED) || '0', 10);
  try {
    const r = await fetch('/api/sync/status');
    if (r.ok) {
      const data = await r.json();
      return Math.max(clientModified, data.lastModified || 0);
    }
  } catch (e) {
    console.warn('[cloud] failed to get server status', e);
  }
  return clientModified;
}

async function pull(remoteFile: any): Promise<boolean> {
  if (!remoteFile) return false;
  
  setStatus('syncing', 'Veriler indiriliyor...');
  const remoteData = await downloadJson(remoteFile.id);
  const remoteModified = remoteData.lastModified || 0;
  const localModified = await getLocalDatabaseModifiedTime();

  if (remoteModified > localModified) {
    console.log('[cloud] Remote is newer. Importing database...', { remoteModified, localModified });
    const r = await fetch('/api/sync/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(remoteData),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Veri içeri aktarımı başarısız oldu.');
    }
    // Update local timestamps
    localStorage.setItem(LS_LAST_MODIFIED, String(remoteModified));
    localStorage.setItem(LS_LAST_SYNC, String(Date.now()));
    return true; // Database updated
  }
  return false;
}

async function push(remoteFile: any): Promise<void> {
  setStatus('syncing', 'Yükleniyor...');
  const r = await fetch('/api/sync/export');
  if (!r.ok) throw new Error('Veritabanı dışa aktarma başarısız.');
  const dbData = await r.json();
  
  // Set the correct modified timestamp
  const localModified = await getLocalDatabaseModifiedTime();
  dbData.lastModified = Math.max(dbData.lastModified || 0, localModified, Date.now());

  await uploadJson('nobet-data.json', dbData, remoteFile ? remoteFile.id : null);
  
  localStorage.setItem(LS_LAST_MODIFIED, String(dbData.lastModified));
  localStorage.setItem(LS_LAST_SYNC, String(Date.now()));
}

export async function syncNow(): Promise<void> {
  if (!signedIn) return;
  if (inFlight) return;
  inFlight = true;
  setStatus('syncing', 'Senkronize ediliyor...');
  try {
    const files = await listAppData();
    const nobetDataFile = files.find((f: any) => f.name === 'nobet-data.json');
    
    let dbUpdated = false;
    if (nobetDataFile) {
      dbUpdated = await pull(nobetDataFile);
    }

    if (!dbUpdated) {
      // Pull did not overwrite database, meaning local is newer or equal. Check if we need to push.
      const remoteModified = nobetDataFile ? (await downloadJson(nobetDataFile.id)).lastModified || 0 : 0;
      const localModified = await getLocalDatabaseModifiedTime();
      if (localModified > remoteModified || !nobetDataFile) {
        console.log('[cloud] Local is newer. Uploading to Drive...');
        await push(nobetDataFile);
      }
    }

    setStatus('ok', 'Eşitleme başarılı');
    
    if (dbUpdated) {
      // Trigger a page refresh to show new data
      window.location.reload();
    }
  } catch (e: any) {
    console.error('[cloud] sync error', e);
    setStatus('error', e.message);
  } finally {
    inFlight = false;
  }
}

export function markDirty() {
  if (!signedIn) return;
  localStorage.setItem(LS_LAST_MODIFIED, String(Date.now()));
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    syncNow().catch((e) => console.warn('[cloud] debounced sync error', e));
  }, PUSH_DEBOUNCE_MS);
}

function startBackgroundPull() {
  clearInterval(pullTimer);
  pullTimer = setInterval(() => {
    if (!signedIn || !navigator.onLine || inFlight) return;
    syncNow().catch((e) => console.warn('[cloud] bg pull error', e));
  }, PULL_INTERVAL_MS);
}

// Window Event Listeners for local mutations
function initMutationListener() {
  if (typeof window === 'undefined') return;

  // Intercept fetch calls to detect mutations
  const originalFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const response = await originalFetch(input, init);
    if (response.ok && typeof input === 'string' && input.startsWith('/api/')) {
      const method = init?.method?.toUpperCase() || 'GET';
      if (method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE') {
        if (!input.includes('/api/sync')) {
          console.log('[cloud sync] Mutation intercepted:', input);
          markDirty();
        }
      }
    }
    return response;
  };

  window.addEventListener('online', () => { if (signedIn) syncNow(); });
}

// Public API initializer
export async function init() {
  if (typeof window === 'undefined') return;
  if (initialized) return;
  initialized = true;
  
  initMutationListener();
  userInfo = restoreUser();

  if (!CLIENT_ID) {
    setStatus('setupNeeded', 'OAuth Client ID yapılandırılmadı.');
    return;
  }

  // 1. Check redirect callback
  const cb = handleRedirectCallback();
  if (cb === 'ok') {
    try {
      setStatus('syncing', 'İlk senkronizasyon...');
      await fetchUserInfo();
      await syncNow();
      startBackgroundPull();
    } catch (e: any) { setStatus('error', e.message); }
    return;
  }
  if (cb === 'error') {
    setStatus('idle', 'Giriş başarısız oldu');
  }

  // 2. Restore cached token
  if (restoreToken()) {
    signedIn = true;
    setStatus('ok');
    try {
      await driveFetch('/about?fields=user'); // Validate token
      await fetchUserInfo();
      await syncNow();
      startBackgroundPull();
    } catch (e) {
      accessToken = null;
      tokenExpiresAt = 0;
      signedIn = false;
      localStorage.removeItem(LS_TOKEN);
      setStatus('idle', 'Oturum süresi dolmuş');
    }
  }

  // 3. Silent re-auth for redirect users
  if (cb === null && !signedIn && localStorage.getItem(LS_MODE) === 'redirect' && userInfo && navigator.onLine) {
    startRedirectAuth(true);
    return;
  }

  // 4. Warm up GIS popup client
  initTokenClient().catch(() => {});
}

// Expose public API
if (typeof window !== 'undefined') {
  window.__nobetCloud = {
    init,
    signIn,
    signOut,
    syncNow,
    markDirty,
    onChange,
    getStatus,
    isSignedIn: () => signedIn,
  };
}
