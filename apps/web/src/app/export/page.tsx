"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";

interface Period {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

type ViewMode = "grid" | "person" | "location";

export default function ExportPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(true);

  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeConflicts, setIncludeConflicts] = useState(true);
  const [view, setView] = useState<ViewMode>("grid");

  useEffect(() => {
    async function loadPeriods() {
      setPeriodsLoading(true);
      try {
        const res = await fetch("/api/periods");
        if (res.ok) {
          const data = await res.json();
          setPeriods(data);
          if (data.length > 0) setSelectedPeriodId(data[0].id);
        }
      } finally {
        setPeriodsLoading(false);
      }
    }
    loadPeriods();
  }, []);

  function buildQueryString() {
    const params = new URLSearchParams({
      view,
      includeSummary: String(includeSummary),
      includeConflicts: String(includeConflicts),
    });
    return params.toString();
  }

  function handleExcelDownload() {
    if (!selectedPeriodId) return;
    window.open(`/api/periods/${selectedPeriodId}/export/excel?${buildQueryString()}`, "_blank");
  }

  function handleWordDownload() {
    if (!selectedPeriodId) return;
    window.open(`/api/periods/${selectedPeriodId}/export/word?${buildQueryString()}`, "_blank");
  }

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Dışa Aktar</h1>

      <div className="space-y-6">
        {/* Period selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Dönem</label>
          {periodsLoading ? (
            <p className="text-sm text-gray-500">Yükleniyor...</p>
          ) : (
            <Select
              id="period"
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
            >
              <option value="">— Dönem seçin —</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({new Date(p.startDate).toLocaleDateString("tr-TR")} –{" "}
                  {new Date(p.endDate).toLocaleDateString("tr-TR")})
                </option>
              ))}
            </Select>
          )}
        </div>

        {/* View mode */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Görünüm</label>
          <div className="flex gap-4">
            {(
              [
                { value: "grid", label: "Tablo (Grid)" },
                { value: "person", label: "Kişi" },
                { value: "location", label: "Lokasyon" },
              ] as { value: ViewMode; label: string }[]
            ).map(({ value, label }) => (
              <label key={value} className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="view"
                  value={value}
                  checked={view === value}
                  onChange={() => setView(value)}
                  className="text-blue-600"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* Options */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Seçenekler</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
              <input
                type="checkbox"
                checked={includeSummary}
                onChange={(e) => setIncludeSummary(e.target.checked)}
                className="rounded text-blue-600"
              />
              Özet dahil et
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
              <input
                type="checkbox"
                checked={includeConflicts}
                onChange={(e) => setIncludeConflicts(e.target.checked)}
                className="rounded text-blue-600"
              />
              Çakışmaları dahil et
            </label>
          </div>
        </div>

        {/* Download buttons */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">İndir</p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="primary"
              onClick={handleExcelDownload}
              disabled={!selectedPeriodId}
            >
              Excel İndir (.xlsx)
            </Button>

            <Button
              variant="secondary"
              disabled
              title="PDF dışa aktarma yakında"
            >
              PDF İndir (yakında)
            </Button>

            <Button
              variant="secondary"
              onClick={handleWordDownload}
              disabled={!selectedPeriodId}
            >
              Word İndir (.docx)
            </Button>
          </div>

          {!selectedPeriodId && (
            <p className="text-xs text-gray-400 mt-2">İndirmek için önce bir dönem seçin.</p>
          )}

          <p className="text-xs text-gray-400 mt-3">
            PDF dışa aktarma yakında kullanıma sunulacaktır.
          </p>
        </div>

        {/* Selected period info */}
        {selectedPeriod && (
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
            <strong>{selectedPeriod.name}</strong> dönemi seçili &mdash;{" "}
            {new Date(selectedPeriod.startDate).toLocaleDateString("tr-TR")} ile{" "}
            {new Date(selectedPeriod.endDate).toLocaleDateString("tr-TR")} arası
          </div>
        )}
      </div>
    </div>
  );
}
