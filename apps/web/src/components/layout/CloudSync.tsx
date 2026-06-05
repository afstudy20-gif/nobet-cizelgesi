"use client";

import { useEffect, useState } from "react";
import { 
  Cloud, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Settings, 
  LogOut,
  User
} from "lucide-react";
import { getStatus, signIn, signOut, syncNow, onChange } from "@/lib/cloud-sync";

export function CloudSync() {
  const [state, setState] = useState(() => getStatus());

  useEffect(() => {
    // Listen to changes in the cloud sync manager
    const unsubscribe = onChange((newStatus) => {
      setState(newStatus);
    });

    // Handle updates when other windows update local state
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "nobet_cloud_token" || e.key === "nobet_cloud_user") {
        setState(getStatus());
      }
    };
    window.addEventListener("storage", handleStorageChange);

    return () => {
      unsubscribe();
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const handleSignIn = async () => {
    try {
      await signIn();
    } catch (err) {
      console.error("[CloudSync] Sign in error", err);
    }
  };

  const handleSignOut = () => {
    if (window.confirm("Google Drive senkronizasyonunu sonlandırmak ve oturumu kapatmak istediğinizden emin misiniz?")) {
      signOut();
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
    switch (state.status) {
      case "syncing":
        return <RefreshCw size={14} className="text-blue-400 animate-spin" />;
      case "ok":
        return <CheckCircle2 size={14} className="text-green-400" />;
      case "error":
        return <AlertTriangle size={14} className="text-red-400" />;
      case "setupNeeded":
        return <Settings size={14} className="text-yellow-400" />;
      default:
        return <Cloud size={14} className="text-gray-400" />;
    }
  };

  const getStatusTitle = () => {
    const lastSyncStr = state.lastSync ? new Date(state.lastSync).toLocaleString("tr-TR") : "Hiç";
    let statusLabel = "Bağlı Değil";
    if (state.status === "syncing") statusLabel = "Eşitleniyor...";
    if (state.status === "ok") statusLabel = "Eşitlendi";
    if (state.status === "error") statusLabel = `Hata: ${state.message}`;
    if (state.status === "setupNeeded") statusLabel = "Kurulum Gerekli";

    return `Durum: ${statusLabel}\nSon Eşitleme: ${lastSyncStr}`;
  };

  return (
    <div className="flex flex-col gap-2 p-3 bg-gray-800/40 rounded-lg border border-gray-700/50 mt-4 mx-2">
      {/* Auth State Button or User Card */}
      {!state.signedIn ? (
        <button
          onClick={handleSignIn}
          disabled={state.status === "setupNeeded"}
          className={`flex items-center justify-center gap-2 w-full py-1.5 px-3 bg-white text-gray-800 text-xs font-semibold rounded-md border border-gray-300 hover:bg-gray-50 active:scale-95 transition-all ${
            state.status === "setupNeeded" ? "border-dashed border-yellow-500 opacity-60 cursor-not-allowed" : ""
          }`}
          title={state.status === "setupNeeded" ? "Google Client ID yapılandırılmadı." : "Google Drive ile Bağla"}
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
            {state.user?.picture ? (
              <img
                src={state.user.picture}
                alt="Profil"
                className="w-5.5 h-5.5 rounded-full border border-gray-600 flex-shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-5.5 h-5.5 rounded-full border border-gray-600 bg-gray-700 flex items-center justify-center flex-shrink-0 text-gray-400">
                <User size={12} />
              </div>
            )}
            <span className="text-[11px] text-gray-300 truncate font-medium">
              {state.user?.email || state.user?.name || "Google Drive"}
            </span>
          </div>
          <button
            onClick={handleSignOut}
            className="text-gray-400 hover:text-red-400 transition-colors p-1"
            title="Oturumu Kapat"
          >
            <LogOut size={13} />
          </button>
        </div>
      )}

      {/* Sync Status / Progress Line */}
      <div className="flex items-center justify-between w-full border-t border-gray-700/30 pt-1.5 mt-0.5">
        <span className="text-[10px] text-gray-400 truncate flex-1">
          {state.status === "syncing" && (state.message || "Senkronize ediliyor...")}
          {state.status === "ok" && "Bulut eşitleme aktif"}
          {state.status === "error" && (state.message || "Eşitleme hatası")}
          {state.status === "setupNeeded" && "Kurulum gerekli"}
          {state.status === "idle" && !state.signedIn && "Çevrimdışı (Yerel)"}
        </span>
        
        <button
          onClick={state.signedIn && state.status !== "syncing" ? handleSyncNow : undefined}
          disabled={!state.signedIn || state.status === "syncing"}
          className={`flex items-center justify-center p-0.5 rounded transition-colors ${
            state.signedIn && state.status !== "syncing" 
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
