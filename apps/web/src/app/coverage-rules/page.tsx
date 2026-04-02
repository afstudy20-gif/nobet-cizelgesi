"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Location {
  id: string;
  code: string;
  name: string;
}

interface ShiftTemplate {
  id: string;
  code: string;
  name: string;
}

interface CoverageRule {
  id: string;
  locationId: string;
  location: Location;
  shiftTemplateId: string;
  shiftTemplate: ShiftTemplate;
  ruleType: "WEEKLY" | "SPECIFIC_DATE" | "DATE_RANGE";
  weekdays: number[];
  specificDate: string | null;
  validFrom: string | null;
  validTo: string | null;
  requiredHeadcount: number;
  priority: number;
  isActive: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEKDAY_LABELS: Record<number, string> = {
  1: "Pzt",
  2: "Sal",
  3: "Çrş",
  4: "Prş",
  5: "Cum",
  6: "Cmt",
  7: "Paz",
};

const RULE_TYPE_LABELS: Record<string, string> = {
  WEEKLY: "Haftalık",
  SPECIFIC_DATE: "Belirli Tarih",
  DATE_RANGE: "Tarih Aralığı",
};

// ─── Form ─────────────────────────────────────────────────────────────────────

const emptyForm = {
  locationId: "",
  shiftTemplateId: "",
  ruleType: "WEEKLY" as "WEEKLY" | "SPECIFIC_DATE" | "DATE_RANGE",
  weekdays: [] as number[],
  specificDate: "",
  validFrom: "",
  validTo: "",
  requiredHeadcount: 1,
  priority: 0,
  isActive: true,
};

type FormState = typeof emptyForm;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CoverageRulesPage() {
  const [rules, setRules] = useState<CoverageRule[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function fetchAll() {
    setLoading(true);
    setError(null);
    try {
      const [rulesRes, locRes, shiftRes] = await Promise.all([
        fetch("/api/coverage-rules"),
        fetch("/api/locations"),
        fetch("/api/shift-templates"),
      ]);
      if (!rulesRes.ok) throw new Error("Kapsam kuralları alınamadı");
      setRules(await rulesRes.json());
      if (locRes.ok) setLocations(await locRes.json());
      if (shiftRes.ok) setShifts(await shiftRes.json());
    } catch {
      setError("Veriler yüklenirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
  }, []);

  function openNew() {
    setForm(emptyForm);
    setEditingId(null);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(rule: CoverageRule) {
    setForm({
      locationId: rule.locationId,
      shiftTemplateId: rule.shiftTemplateId,
      ruleType: rule.ruleType,
      weekdays: rule.weekdays,
      specificDate: rule.specificDate ?? "",
      validFrom: rule.validFrom ?? "",
      validTo: rule.validTo ?? "",
      requiredHeadcount: rule.requiredHeadcount,
      priority: rule.priority,
      isActive: rule.isActive,
    });
    setEditingId(rule.id);
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const url = editingId ? `/api/coverage-rules/${editingId}` : "/api/coverage-rules";
      const method = editingId ? "PATCH" : "POST";
      const body = {
        ...form,
        requiredHeadcount: Number(form.requiredHeadcount),
        priority: Number(form.priority),
        specificDate: form.specificDate || null,
        validFrom: form.validFrom || null,
        validTo: form.validTo || null,
      };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? "İşlem başarısız oldu");
      }
      closeModal();
      await fetchAll();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(rule: CoverageRule) {
    if (
      !window.confirm(
        `"${rule.location.name} – ${rule.shiftTemplate.name}" kuralını silmek istediğinizden emin misiniz?`
      )
    )
      return;
    try {
      const res = await fetch(`/api/coverage-rules/${rule.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Silme işlemi başarısız");
      await fetchAll();
    } catch {
      alert("Kural silinirken bir hata oluştu.");
    }
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleWeekday(day: number) {
    setForm((p) => ({
      ...p,
      weekdays: p.weekdays.includes(day)
        ? p.weekdays.filter((d) => d !== day)
        : [...p.weekdays, day],
    }));
  }

  function handleRuleTypeChange(ruleType: FormState["ruleType"]) {
    setForm((p) => ({ ...p, ruleType, weekdays: [], specificDate: "", validFrom: "", validTo: "" }));
  }

  const showWeekdays = form.ruleType === "WEEKLY" || form.ruleType === "DATE_RANGE";
  const showSpecificDate = form.ruleType === "SPECIFIC_DATE";
  const showDateRange = form.ruleType === "DATE_RANGE";

  function formatDays(rule: CoverageRule): string {
    if (rule.ruleType === "SPECIFIC_DATE") return rule.specificDate ?? "—";
    if (rule.weekdays.length === 0) {
      if (rule.validFrom || rule.validTo) return `${rule.validFrom ?? ""} – ${rule.validTo ?? ""}`;
      return "—";
    }
    const days = rule.weekdays
      .slice()
      .sort((a, b) => a - b)
      .map((d) => WEEKDAY_LABELS[d])
      .join(", ");
    if (rule.ruleType === "DATE_RANGE" && (rule.validFrom || rule.validTo)) {
      return `${days} (${rule.validFrom ?? ""} – ${rule.validTo ?? ""})`;
    }
    return days;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Kapsam Kuralları</h1>
        <Button onClick={openNew}>+ Yeni Kural</Button>
      </div>

      {loading && <p className="text-sm text-gray-500">Yükleniyor...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {["Lokasyon", "Vardiya", "Kural Tipi", "Günler/Tarih", "Kişi Sayısı", "Öncelik", "Durum", "İşlemler"].map(
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
              {rules.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    Kayıt bulunamadı.
                  </td>
                </tr>
              )}
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{rule.location.name}</td>
                  <td className="px-4 py-3 text-gray-900">{rule.shiftTemplate.name}</td>
                  <td className="px-4 py-3 text-gray-600">{RULE_TYPE_LABELS[rule.ruleType]}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{formatDays(rule)}</td>
                  <td className="px-4 py-3 text-gray-700 font-medium">{rule.requiredHeadcount}</td>
                  <td className="px-4 py-3 text-gray-600">{rule.priority}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        rule.isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {rule.isActive ? "Aktif" : "Pasif"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openEdit(rule)}>
                        Düzenle
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleDelete(rule)}>
                        Sil
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingId ? "Kapsam Kuralı Düzenle" : "Yeni Kapsam Kuralı"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select
              id="locationId"
              label="Lokasyon"
              value={form.locationId}
              onChange={(e) => setField("locationId", e.target.value)}
              required
            >
              <option value="">— Seçiniz —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
            <Select
              id="shiftTemplateId"
              label="Vardiya"
              value={form.shiftTemplateId}
              onChange={(e) => setField("shiftTemplateId", e.target.value)}
              required
            >
              <option value="">— Seçiniz —</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>

          <Select
            id="ruleType"
            label="Kural Tipi"
            value={form.ruleType}
            onChange={(e) => handleRuleTypeChange(e.target.value as FormState["ruleType"])}
          >
            <option value="WEEKLY">Haftalık</option>
            <option value="SPECIFIC_DATE">Belirli Tarih</option>
            <option value="DATE_RANGE">Tarih Aralığı</option>
          </Select>

          {showWeekdays && (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Günler</label>
              <div className="flex gap-2 flex-wrap">
                {([1, 2, 3, 4, 5, 6, 7] as const).map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleWeekday(day)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-md border transition-colors",
                      form.weekdays.includes(day)
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    )}
                  >
                    {WEEKDAY_LABELS[day]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showSpecificDate && (
            <Input
              label="Tarih"
              type="date"
              value={form.specificDate}
              onChange={(e) => setField("specificDate", e.target.value)}
            />
          )}

          {showDateRange && (
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Başlangıç Tarihi"
                type="date"
                value={form.validFrom}
                onChange={(e) => setField("validFrom", e.target.value)}
              />
              <Input
                label="Bitiş Tarihi"
                type="date"
                value={form.validTo}
                onChange={(e) => setField("validTo", e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <Input
              id="requiredHeadcount"
              label="Gerekli Kişi Sayısı"
              type="number"
              min={1}
              value={form.requiredHeadcount}
              onChange={(e) => setField("requiredHeadcount", Number(e.target.value))}
              required
            />
            <Input
              id="priority"
              label="Öncelik"
              type="number"
              min={0}
              value={form.priority}
              onChange={(e) => setField("priority", Number(e.target.value))}
            />
            <Select
              id="isActive"
              label="Durum"
              value={form.isActive ? "true" : "false"}
              onChange={(e) => setField("isActive", e.target.value === "true")}
            >
              <option value="true">Aktif</option>
              <option value="false">Pasif</option>
            </Select>
          </div>

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
