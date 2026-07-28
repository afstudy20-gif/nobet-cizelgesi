"use client";

import {
  Cloud,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Settings,
  User
} from "lucide-react";
import { useSync } from "@/lib/sync";

/** The exact message `driveSync` publishes while a sync cycle is in flight. */
const SYNCING_MESSAGE = "Senkronize ediliyor…";
const ERROR_PREFIX = "Hata";

export function CloudSync() {
  const { state, connect, syncNow } = useSync();

  const setupNeeded = !state.configured;
  const syncing = state.status === SYNCING_MESSAGE;
  const errored = state.status.startsWith(ERROR_PREFIX);

  const handleConnect = async () => {
    try {
      await connect();
    } catch (err) {
      console.error("[CloudSync] Connect error", err);
    }
  };

  const handleSyncNow = async () => {
    try {
      await syncNow();
    } catch (err) {
      console.error("[CloudSync] Sync now error", err);
    }
  };

  const getStatusIcon = () => {
    if (setupNeeded) {
      return <Settings size={14} className="text-yellow-400" />;
    }
    if (syncing) {
      return <RefreshCw size={14} className="text-blue-400 animate-spin" />;
    }
    if (errored) {
      return <AlertTriangle size={14} className="text-red-400" />;
    }
    if (state.connected) {
      return <CheckCircle2 size={14} className="text-green-400" />;
    }
    return <Cloud size={14} className="text-gray-400" />;
  };

  const getStatusTitle = () => {
    const lastSyncStr = state.lastSync ? new Date(state.lastSync).toLocaleString("tr-TR") : "Hiç";
    let statusLabel = "Bağlı Değil";
    if (setupNeeded) statusLabel = "Kurulum Gerekli";
    else if (syncing) statusLabel = "Eşitleniyor...";
    else if (errored) statusLabel = state.status;
    else if (state.connected) statusLabel = "Eşitlendi";

    return `Durum: ${statusLabel}\nSon Eşitleme: ${lastSyncStr}`;
  };

  const getStatusLine = () => {
    if (setupNeeded) return "Kurulum gerekli";
    // The sync module publishes its own Turkish status messages
    // ("Senkronize ediliyor…", "Hata: …", reconnect hints) — show them as-is.
    if (state.status) return state.status;
    if (state.connected) return "Bulut eşitleme aktif";
    return "Çevrimdışı (Yerel)";
  };

  return (
    <div className="flex flex-col gap-2 p-3 bg-gray-800/40 rounded-lg border border-gray-700/50 mt-4 mx-2">
      {/* Connection State Button or Drive Card */}
      {!state.connected ? (
        <button
          onClick={handleConnect}
          disabled={setupNeeded}
          className={`flex items-center justify-center gap-2 w-full py-1.5 px-3 bg-white text-gray-800 text-xs font-semibold rounded-md border border-gray-300 hover:bg-gray-50 active:scale-95 transition-all ${
            setupNeeded ? "border-dashed border-yellow-500 opacity-60 cursor-not-allowed" : ""
          }`}
          title={setupNeeded ? "Google Client ID yapılandırılmadı." : "Google Drive ile Bağla"}
        >
          <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true" className="flex-shrink-0">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34.3 6 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34.3 6 29.4 4 24 4 16.1 4 9.3 8.4 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.3l-6.3-5.2c-2 1.4-4.5 2.5-7.3 2.5-5.2 0-9.7-3.3-11.3-8l-6.5 5C9.2 39.5 16 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4 5.7l6.3 5.2c-.4.4 6.4-4.7 6.4-14.4 0-1.3-.1-2.4-.4-3.5z"/>
          </svg>
          Google ile Bağla
        </button>
      ) : (
        <div className="flex items-center justify-between gap-2 w-full">
          <div className="flex items-center gap-2 overflow-hidden flex-1">
            <div className="w-5.5 h-5.5 rounded-full border border-gray-600 bg-gray-700 flex items-center justify-center flex-shrink-0 text-gray-400">
              <User size={12} />
            </div>
            <span className="text-[11px] text-gray-300 truncate font-medium">
              Google Drive
            </span>
          </div>
        </div>
      )}

      {/* Sync Status / Progress Line */}
      <div className="flex items-center justify-between w-full border-t border-gray-700/30 pt-1.5 mt-0.5">
        <span className="text-[10px] text-gray-400 truncate flex-1">
          {getStatusLine()}
        </span>

        <button
          onClick={state.connected && !syncing ? handleSyncNow : undefined}
          disabled={!state.connected || syncing}
          className={`flex items-center justify-center p-0.5 rounded transition-colors ${
            state.connected && !syncing
              ? "hover:bg-gray-700 cursor-pointer"
              : "opacity-80 cursor-default"
          }`}
          title={getStatusTitle()}
        >
          {getStatusIcon()}
        </button>
      </div>
    </div>
  );
}
