"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import {
  coverageRulesRepo,
  locationsRepo,
  shiftTemplatesRepo,
  RepoError,
  type CoverageRuleCreateInput,
  type CoverageRuleUpdateInput,
  type DetailedCoverageRule,
} from "@/lib/db/repo";
import type { Location, ShiftTemplate } from "@/lib/db/types";
import { useLive, mutate } from "@/lib/db/live";

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
  roleRequirements: {} as Record<string, number>,
  priority: 0,
  isActive: true,
};

type FormState = typeof emptyForm;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CoverageRulesPage() {
  const { data: rules, loading: rulesLoading, error: rulesError } = useLive<
    DetailedCoverageRule[]
  >(() => coverageRulesRepo.listDetailed(), []);
  const { data: locations } = useLive<Location[]>(() => locationsRepo.list(), []);
  const { data: shifts } = useLive<ShiftTemplate[]>(() => shiftTemplatesRepo.list(), []);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loading = rulesLoading;
  const error = rulesError ? "Veriler yüklenirken bir hata oluştu." : null;

  function openNew() {
    setForm(emptyForm);
    setEditingId(null);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(rule: DetailedCoverageRule) {
    setForm({
      locationId: rule.locationId,
      shiftTemplateId: rule.shiftTemplateId,
      ruleType: rule.ruleType === "ONE_DAY" ? "SPECIFIC_DATE" : rule.ruleType,
      weekdays: rule.weekdays,
      specificDate: rule.specificDate ?? "",
      validFrom: rule.validFrom ?? "",
      validTo: rule.validTo ?? "",
      requiredHeadcount: rule.requiredHeadcount,
      roleRequirements: rule.roleRequirements ?? {},
      priority: rule.priority,
      isActive: rule.isActive,
    });
    setEditingId(rule.id);
    setFormError(null);
    setModalOpen(true);
  }

  function openCopy(rule: DetailedCoverageRule) {
    setForm({
      locationId: rule.locationId,
      shiftTemplateId: rule.shiftTemplateId,
      ruleType: rule.ruleType === "ONE_DAY" ? "SPECIFIC_DATE" : rule.ruleType,
      weekdays: rule.weekdays,
      specificDate: rule.specificDate ?? "",
      validFrom: rule.validFrom ?? "",
      validTo: rule.validTo ?? "",
      requiredHeadcount: rule.requiredHeadcount,
      roleRequirements: rule.roleRequirements ?? {},
      priority: rule.priority,
      isActive: rule.isActive,
    });
    setEditingId(null);
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
      let sumRoles = 0;
      const roleReqsFiltered: Record<string, number> = {};
      for (const [r, c] of Object.entries(form.roleRequirements)) {
        if (c > 0) {
          roleReqsFiltered[r] = c;
          sumRoles += c;
        }
      }

      const payload: CoverageRuleCreateInput = {
        locationId: form.locationId,
        shiftTemplateId: form.shiftTemplateId,
        ruleType: form.ruleType,
        weekdays: form.weekdays,
        requiredHeadcount:
          sumRoles > 0
            ? Math.max(Number(form.requiredHeadcount), sumRoles)
            : Number(form.requiredHeadcount),
        roleRequirements: Object.keys(roleReqsFiltered).length > 0 ? roleReqsFiltered : null,
        priority: Number(form.priority),
        specificDate: form.specificDate || null,
        validFrom: form.validFrom || null,
        validTo: form.validTo || null,
        isActive: form.isActive,
      };
      if (editingId) {
        await mutate(() =>
          coverageRulesRepo.update(editingId, payload as CoverageRuleUpdateInput)
        );
      } else {
        await mutate(() => coverageRulesRepo.create(payload));
      }
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

  async function handleDelete(rule: DetailedCoverageRule) {
    if (
      !window.confirm(
        `"${rule.location?.name ?? ""} – ${rule.shiftTemplate?.name ?? ""}" kuralını silmek istediğinizden emin misiniz?`
      )
    )
      return;
    try {
      await mutate(() => coverageRulesRepo.remove(rule.id));
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

  function formatDays(rule: DetailedCoverageRule): string {
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
              {rules && rules.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    Kayıt bulunamadı.
                  </td>
                </tr>
              )}
              {rules?.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{rule.location?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-900">{rule.shiftTemplate?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{RULE_TYPE_LABELS[rule.ruleType] ?? rule.ruleType}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{formatDays(rule)}</td>
                  <td className="px-4 py-3 text-gray-700 font-medium">
                    <div>{rule.requiredHeadcount}</div>
                    {rule.roleRequirements && typeof rule.roleRequirements === "object" && Object.keys(rule.roleRequirements).length > 0 && (
                      <div className="text-xs text-gray-400 mt-0.5 font-normal">
                        {Object.entries(rule.roleRequirements)
                          .map(([r, c]) => `${r === "UZMAN" ? "Uzman" : r === "HEMSIRE" ? "Hemşire" : "Asistan"}: ${c}`)
                          .join(", ")}
                      </div>
                    )}
                  </td>
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
                      <Button variant="ghost" size="sm" onClick={() => openCopy(rule)}>
                        Kopyala
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
              {locations?.map((l) => (
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
              {shifts?.map((s) => (
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

          <div className="border-t border-gray-100 pt-4 mt-2">
            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">Unvan / Rol Detayları</h3>
            <p className="text-xs text-gray-400 mb-3">
              Nöbet yerinde bulunması gereken asgari uzman, asistan ve hemşire sayılarını belirleyin.
              (Uzman + Asistan + Hemşire toplamı gerekli kişi sayısından fazla olamaz. Gerekirse gerekli kişi sayısı otomatik artırılır).
            </p>
            <div className="grid grid-cols-3 gap-4">
              <Input
                id="roleReqUzman"
                label="Uzman Doktor Sayısı"
                type="number"
                min={0}
                value={form.roleRequirements?.UZMAN ?? ""}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : 0;
                  setForm(prev => {
                    const nextReq = { ...prev.roleRequirements };
                    if (val === 0) {
                      delete (nextReq as Record<string, number | undefined>).UZMAN;
                    } else {
                      nextReq.UZMAN = val;
                    }
                    return { ...prev, roleRequirements: nextReq };
                  });
                }}
              />
              <Input
                id="roleReqAsistan"
                label="Asistan Sayısı"
                type="number"
                min={0}
                value={form.roleRequirements?.ASISTAN ?? ""}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : 0;
                  setForm(prev => {
                    const nextReq = { ...prev.roleRequirements };
                    if (val === 0) {
                      delete (nextReq as Record<string, number | undefined>).ASISTAN;
                    } else {
                      nextReq.ASISTAN = val;
                    }
                    return { ...prev, roleRequirements: nextReq };
                  });
                }}
              />
              <Input
                id="roleReqHemsire"
                label="Hemşire Sayısı"
                type="number"
                min={0}
                value={form.roleRequirements?.HEMSIRE ?? ""}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : 0;
                  setForm(prev => {
                    const nextReq = { ...prev.roleRequirements };
                    if (val === 0) {
                      delete (nextReq as Record<string, number | undefined>).HEMSIRE;
                    } else {
                      nextReq.HEMSIRE = val;
                    }
                    return { ...prev, roleRequirements: nextReq };
                  });
                }}
              />
            </div>
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
