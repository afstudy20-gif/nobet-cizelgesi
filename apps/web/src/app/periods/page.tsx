"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

interface Period {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  _count: {
    requirements: number;
    assignments: number;
  };
}

const emptyForm = {
  name: "",
  startDate: "",
  endDate: "",
};

type FormState = typeof emptyForm;

type GenerateResult = {
  assigned: number;
  unfilled: number;
  total: number;
  conflicts: number;
} | null;

type ToastMessage = { id: string; text: string; type: "success" | "error" };

function StatusBadge({ status }: { status: Period["status"] }) {
  const map: Record<Period["status"], { label: string; className: string }> = {
    DRAFT: { label: "Taslak", className: "bg-gray-100 text-gray-700" },
    PUBLISHED: { label: "Yayında", className: "bg-green-100 text-green-700" },
    ARCHIVED: { label: "Arşivlendi", className: "bg-yellow-100 text-yellow-700" },
  };
  const { label, className } = map[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

export default function PeriodsPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [generateResults, setGenerateResults] = useState<Record<string, GenerateResult>>({});

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  function addToast(text: string, type: "success" | "error") {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }

  async function fetchPeriods() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/periods");
      if (!res.ok) throw new Error("Dönemler alınamadı");
      const data = await res.json();
      setPeriods(data);
    } catch {
      setError("Dönem listesi yüklenirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPeriods();
  }, []);

  function openNew() {
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setForm(emptyForm);
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? "İşlem başarısız oldu");
      }
      closeModal();
      await fetchPeriods();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(period: Period) {
    if (
      !window.confirm(
        `"${period.name}" dönemini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`
      )
    )
      return;
    try {
      const res = await fetch(`/api/periods/${period.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Silme işlemi başarısız");
      await fetchPeriods();
    } catch {
      addToast("Dönem silinirken bir hata oluştu.", "error");
    }
  }

  async function handleGenerate(period: Period) {
    if (generatingIds.has(period.id)) return;

    setGeneratingIds((prev) => new Set(prev).add(period.id));
    setGenerateResults((prev) => ({ ...prev, [period.id]: null }));

    try {
      // Step 1: Generate requirements
      const reqRes = await fetch(`/api/periods/${period.id}/requirements/generate`, {
        method: "POST",
      });
      if (!reqRes.ok) {
        const data = await reqRes.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? "Gereksinim oluşturma başarısız");
      }

      // Step 2: Generate schedule
      const schedRes = await fetch(`/api/periods/${period.id}/schedule/generate`, {
        method: "POST",
      });
      if (!schedRes.ok) {
        const data = await schedRes.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? "Çizelge oluşturma başarısız");
      }

      const result = await schedRes.json();
      setGenerateResults((prev) => ({ ...prev, [period.id]: result }));
      addToast(
        `"${period.name}": ${result.assigned} atama yapıldı, ${result.unfilled} boş kaldı.`,
        "success"
      );
      await fetchPeriods();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Çizelge oluşturulurken bir hata oluştu.";
      addToast(msg, "error");
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(period.id);
        return next;
      });
    }
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="p-6">
      {/* Toast notifications */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-lg shadow-lg text-sm text-white max-w-sm ${
              t.type === "success" ? "bg-green-600" : "bg-red-600"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Dönem Yönetimi</h1>
        <Button onClick={openNew}>+ Yeni Dönem</Button>
      </div>

      {loading && <p className="text-sm text-gray-500">Yükleniyor...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {["Ad", "Başlangıç", "Bitiş", "Durum", "# Gereksinim", "# Atama", "İşlemler"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {periods.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    Kayıt bulunamadı.
                  </td>
                </tr>
              )}
              {periods.map((period) => {
                const isGenerating = generatingIds.has(period.id);
                const result = generateResults[period.id];
                return (
                  <tr key={period.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {period.name}
                      {result && (
                        <p className="text-xs text-green-700 mt-0.5 font-normal">
                          {result.assigned} atama yapıldı, {result.unfilled} boş kaldı
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(period.startDate).toLocaleDateString("tr-TR")}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(period.endDate).toLocaleDateString("tr-TR")}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={period.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{period._count.requirements}</td>
                    <td className="px-4 py-3 text-gray-600">{period._count.assignments}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isGenerating}
                          onClick={() => handleGenerate(period)}
                        >
                          {isGenerating ? "Oluşturuluyor..." : "Çizelge Oluştur"}
                        </Button>
                        <Link href={`/schedule?periodId=${period.id}`}>
                          <Button variant="ghost" size="sm">
                            Görüntüle
                          </Button>
                        </Link>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDelete(period)}
                        >
                          Sil
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={closeModal} title="Yeni Dönem" size="md">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Input
            id="name"
            label="Ad"
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            required
          />
          <Input
            id="startDate"
            label="Başlangıç Tarihi"
            type="date"
            value={form.startDate}
            onChange={(e) => setField("startDate", e.target.value)}
            required
          />
          <Input
            id="endDate"
            label="Bitiş Tarihi"
            type="date"
            value={form.endDate}
            onChange={(e) => setField("endDate", e.target.value)}
            required
          />
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal}>
              İptal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
