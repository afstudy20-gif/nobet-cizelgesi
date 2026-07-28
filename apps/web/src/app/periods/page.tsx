"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  getSetupReadiness,
  schedulePeriodsRepo,
  shiftRequirementsRepo,
  RepoError,
  type SchedulePeriodCreateInput,
  type SchedulePeriodListItem,
  type SetupReadiness,
} from "@/lib/db/repo";
import { useLive, mutate } from "@/lib/db/live";
import { generateScheduleForPeriod, type ScheduleGenerationResult } from "@/lib/generate-schedule";

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

type GenerateResult = ScheduleGenerationResult | null;

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

function toPeriod(item: SchedulePeriodListItem): Period {
  return {
    id: item.id,
    name: item.name,
    startDate: item.startDate,
    endDate: item.endDate,
    status: item.status,
    _count: {
      requirements: item._count.requirements,
      assignments: item._count.assignments,
    },
  };
}

function PeriodsPageInner() {
  const searchParams = useSearchParams();
  const {
    data: rawPeriods,
    loading,
    error,
  } = useLive<SchedulePeriodListItem[]>(() => schedulePeriodsRepo.listDetailed(), []);
  const { data: readiness } = useLive<SetupReadiness>(() => getSetupReadiness(), []);

  const periods = rawPeriods?.map(toPeriod);

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

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      openNew();
    }
  }, [searchParams]);

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
      const payload: SchedulePeriodCreateInput = {
        name: form.name,
        startDate: form.startDate,
        endDate: form.endDate,
      };
      await mutate(() => schedulePeriodsRepo.create(payload));
      closeModal();
    } catch (err) {
      setFormError(
        err instanceof RepoError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Bir hata oluştu"
      );
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
      await mutate(() => schedulePeriodsRepo.remove(period.id));
    } catch {
      addToast("Dönem silinirken bir hata oluştu.", "error");
    }
  }

  async function handleGenerate(period: Period) {
    if (generatingIds.has(period.id)) return;

    if (readiness && !readiness.ready) {
      addToast(readiness.blockers.join(" "), "error");
      return;
    }

    const hasExisting =
      period._count.assignments > 0 || period._count.requirements > 0;
    if (hasExisting) {
      const ok = window.confirm(
        `"${period.name}" için çizelge yeniden üretilecek. Kilitli olmayan atamalar silinir. Devam edilsin mi?`
      );
      if (!ok) return;
    }

    setGeneratingIds((prev) => new Set(prev).add(period.id));
    setGenerateResults((prev) => ({ ...prev, [period.id]: null }));

    try {
      // Generation is now synchronous main-thread work; the busy flag above
      // keeps the button disabled so a second run cannot stack on this one.
      // Step 1: Generate shift requirements for the period.
      await mutate(() => shiftRequirementsRepo.generateForPeriod(period.id));
      // Step 2: Solve the schedule and persist it (helper triggers sync).
      const result = await generateScheduleForPeriod(period.id);
      setGenerateResults((prev) => ({ ...prev, [period.id]: result }));
      addToast(
        `"${period.name}": ${result.assigned} atama yapıldı, ${result.unfilled} boş kaldı.`,
        "success"
      );
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

      {readiness && !readiness.ready && (
        <div className="mb-4 p-4 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900">
          <p className="font-medium mb-1">Çizelge üretilemez — önce kurulumu tamamlayın:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {readiness.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {loading && <p className="text-sm text-gray-500">Yükleniyor...</p>}
      {error && <p className="text-sm text-red-600">Dönem listesi yüklenirken bir hata oluştu.</p>}

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
              {periods && periods.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    Kayıt bulunamadı.
                  </td>
                </tr>
              )}
              {periods?.map((period) => {
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
                          disabled={isGenerating || readiness?.ready === false}
                          title={
                            readiness && !readiness.ready
                              ? readiness.blockers.join(" ")
                              : undefined
                          }
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

export default function PeriodsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Yükleniyor...</div>}>
      <PeriodsPageInner />
    </Suspense>
  );
}
