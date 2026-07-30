"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Download, Trash2, Clipboard, FileUp } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/i18n/I18nProvider";
import { useSync } from "@/lib/sync";
import {
  listBriefcase,
  uploadBriefcase,
  streamBriefcaseTo,
  downloadBriefcase,
  removeBriefcase,
  type BriefcaseEntry,
} from "@/lib/sync";
import { cn } from "@/lib/cn";
import { openWritableForSave, supportsSaveFilePicker } from "./fsAccess";

interface BriefcaseModalProps {
  open: boolean;
  onClose: () => void;
}

interface ProgressState {
  /** Entry id or the synthetic upload key the progress line refers to. */
  key: string;
  label: string;
}

function formatSize(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const rounded = unit === 0 ? value : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function BriefcaseModal({ open, onClose }: BriefcaseModalProps) {
  const { t } = useI18n();
  const { state, connect } = useSync();

  const [entries, setEntries] = useState<BriefcaseEntry[]>([]);
  const [listError, setListError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [actionError, setActionError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  // Entry id currently being downloaded (drives the spinner on its button).
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Cancel guard: closed while a transfer is mid-flight cannot abort the fetch,
  // but stops the completed handler from touching unmounted state.
  const openRef = useRef(open);
  openRef.current = open;

  const refresh = useCallback(async () => {
    setListError("");
    try {
      const list = await listBriefcase();
      if (openRef.current) setEntries(list);
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Load the live list only while connected and open — never on mount, never on
  // a poll. authFetch may open the consent popup, so it must follow a gesture;
  // opening the modal is the user's gesture here.
  useEffect(() => {
    if (!open) return;
    if (state.connected) {
      void refresh();
    } else {
      setEntries([]);
      setListError("");
      setActionError("");
    }
  }, [open, state.connected, refresh]);

  const handleConnect = async () => {
    setActionError("");
    try {
      await connect();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const uploadOne = useCallback(
    async (file: File) => {
      setBusy(true);
      setActionError("");
      setProgress({ key: `upload:${file.name}`, label: file.name });
      try {
        await uploadBriefcase(file, (part, total) => {
          if (openRef.current) {
            setProgress({ key: `upload:${file.name}`, label: t("briefcase.uploading", { part, total }) });
          }
        });
        if (openRef.current) await refresh();
      } catch (err) {
        if (openRef.current) {
          setActionError(
            `${t("briefcase.uploadError")} ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } finally {
        if (openRef.current) {
          setBusy(false);
          setProgress(null);
        }
      }
    },
    [refresh, t],
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      // Upload sequentially so each part's progress is unambiguous and we don't
      // double the in-memory footprint of a chunked upload.
      void list.reduce<Promise<void>>(
        (chain, file) => chain.then(() => uploadOne(file)),
        Promise.resolve(),
      );
    },
    [uploadOne],
  );

  const handlePaste = async () => {
    setActionError("");
    try {
      const clip = await navigator.clipboard.read();
      const imageType = clip.find((item) => item.types.includes("image/png"));
      if (!imageType) {
        setActionError(t("briefcase.pasteImageNone"));
        return;
      }
      const blob = await imageType.getType("image/png");
      const stamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const file = new File([blob], `pasted-${stamp}.png`, { type: "image/png" });
      void uploadOne(file);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDownload = async (entry: BriefcaseEntry) => {
    setActionError("");
    setDownloadingId(entry.id);
    setProgress({
      key: `download:${entry.id}`,
      label: t("briefcase.download"),
    });
    try {
      if (supportsSaveFilePicker()) {
        // Open the picker synchronously inside the gesture, before any await
        // that would consume it, then stream parts straight to disk.
        const writable = await openWritableForSave(entry.name);
        await streamBriefcaseTo(
          entry,
          writable,
          (part, total) => {
            if (openRef.current) {
              setProgress({
                key: `download:${entry.id}`,
                label: t("briefcase.part", { part, total }),
              });
            }
          },
        );
      } else {
        // Fallback: reassemble in memory and trigger a download. Revokes the
        // object URL so the blob is freed once the browser has it.
        const blob = await downloadBriefcase(entry, (part, total) => {
          if (openRef.current) {
            setProgress({
              key: `download:${entry.id}`,
              label: t("briefcase.part", { part, total }),
            });
          }
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = entry.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      if (openRef.current) {
        setActionError(
          `${t("briefcase.downloadError")} ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } finally {
      if (openRef.current) {
        setDownloadingId(null);
        setProgress(null);
      }
    }
  };

  const handleDelete = async (entry: BriefcaseEntry) => {
    if (!window.confirm(t("briefcase.confirmDelete"))) return;
    setActionError("");
    setBusy(true);
    try {
      await removeBriefcase(entry);
      if (openRef.current) await refresh();
    } catch (err) {
      if (openRef.current) {
        setActionError(
          `${t("briefcase.deleteError")} ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } finally {
      if (openRef.current) setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("briefcase.title")} size="md">
      <div className="p-6 space-y-4">
        {!state.connected ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-gray-600 leading-relaxed">
              {t("briefcase.signInNeeded")}
            </p>
            <Button onClick={handleConnect} disabled={busy}>
              {busy ? t("briefcase.connecting") : t("briefcase.signInGoogle")}
            </Button>
            {actionError ? (
              <p className="text-xs text-red-600">{actionError}</p>
            ) : null}
          </div>
        ) : (
          <>
            <Dropzone
              dragOver={dragOver}
              setDragOver={setDragOver}
              onFiles={handleFiles}
              onPick={() => fileInputRef.current?.click()}
              onPaste={handlePaste}
              disabled={busy}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
                e.target.value = "";
              }}
            />

            {progress ? (
              <p className="text-xs text-blue-600 text-center">{progress.label}</p>
            ) : null}
            {actionError ? (
              <p className="text-xs text-red-600 text-center">{actionError}</p>
            ) : null}
            {listError ? (
              <p className="text-xs text-red-600 text-center">
                {t("briefcase.loadError")} {listError}
              </p>
            ) : null}

            {entries.length === 0 ? (
              progress ? null : (
                <p className="text-sm text-gray-500 text-center py-4">
                  {t("briefcase.empty")}
                </p>
              )
            ) : (
              <ul className="border border-gray-200 rounded-lg max-h-72 overflow-auto divide-y divide-gray-100">
                {entries.map((entry) => (
                  <BriefcaseRow
                    key={entry.id}
                    entry={entry}
                    downloading={downloadingId === entry.id}
                    onDownload={() => handleDownload(entry)}
                    onDelete={() => handleDelete(entry)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

interface DropzoneProps {
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onFiles: (files: FileList | File[]) => void;
  onPick: () => void;
  onPaste: () => void;
  disabled: boolean;
}

function Dropzone({
  dragOver,
  setDragOver,
  onFiles,
  onPick,
  onPaste,
  disabled,
}: DropzoneProps) {
  const { t } = useI18n();
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (disabled) return;
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
      className={cn(
        "flex flex-col items-center gap-2 py-6 px-4 rounded-lg border-2 border-dashed text-center transition-colors",
        dragOver
          ? "border-blue-500 bg-blue-50 text-blue-600"
          : "border-gray-300 text-gray-500",
      )}
    >
      <Upload size={24} />
      <p className="text-sm">{t("briefcase.dropHint")}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="primary" onClick={onPick} disabled={disabled}>
          <FileUp size={14} />
          {t("briefcase.chooseFile")}
        </Button>
        <Button size="sm" variant="secondary" onClick={onPaste} disabled={disabled}>
          <Clipboard size={14} />
          {t("briefcase.pasteImage")}
        </Button>
      </div>
    </div>
  );
}

interface BriefcaseRowProps {
  entry: BriefcaseEntry;
  downloading: boolean;
  onDownload: () => void;
  onDelete: () => void;
}

function BriefcaseRow({
  entry,
  downloading,
  onDownload,
  onDelete,
}: BriefcaseRowProps) {
  const { t } = useI18n();
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-3 py-2.5",
        downloading && "bg-blue-50",
      )}
    >
      <div className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-gray-900 truncate">
          {entry.name}
        </span>
        <span className="block text-xs text-gray-500">
          {formatSize(entry.size)} · {formatDate(entry.modifiedTime)}
          {entry.incomplete ? ` · ${t("briefcase.incomplete")}` : null}
        </span>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <button
          onClick={onDownload}
          disabled={entry.incomplete || downloading}
          title={t("briefcase.download")}
          className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download size={14} className={downloading ? "animate-spin" : ""} />
        </button>
        <button
          onClick={onDelete}
          title={t("briefcase.delete")}
          className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded-md text-gray-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}
