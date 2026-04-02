"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";

interface ShiftTemplate {
  id: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  requiredHeadcount: number;
  isNightShift: boolean;
  minimumRestHoursAfter: number | null;
  color: string | null;
  isActive: boolean;
  notes: string | null;
}

const emptyForm = {
  code: "",
  name: "",
  startTime: "",
  endTime: "",
  crossesMidnight: false,
  requiredHeadcount: 1,
  isNightShift: false,
  minimumRestHoursAfter: "",
  color: "#3b82f6",
  isActive: true,
  notes: "",
};

type FormState = typeof emptyForm;

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function fetchShifts() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/shift-templates");
      if (!res.ok) throw new Error("Veriler alınamadı");
      const data = await res.json();
      setShifts(data);
    } catch {
      setError("Vardiya listesi yüklenirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchShifts();
  }, []);

  function openNew() {
    setForm(emptyForm);
    setEditingId(null);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(shift: ShiftTemplate) {
    setForm({
      code: shift.code,
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      crossesMidnight: shift.crossesMidnight,
      requiredHeadcount: shift.requiredHeadcount,
      isNightShift: shift.isNightShift,
      minimumRestHoursAfter: shift.minimumRestHoursAfter?.toString() ?? "",
      color: shift.color ?? "#3b82f6",
      isActive: shift.isActive,
      notes: shift.notes ?? "",
    });
    setEditingId(shift.id);
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
      const url = editingId
        ? `/api/shift-templates/${editingId}`
        : "/api/shift-templates";
      const method = editingId ? "PATCH" : "POST";
      const body = {
        ...form,
        requiredHeadcount: Number(form.requiredHeadcount),
        minimumRestHoursAfter: form.minimumRestHoursAfter
          ? Number(form.minimumRestHoursAfter)
          : null,
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
      await fetchShifts();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(shift: ShiftTemplate) {
    if (!window.confirm(`"${shift.name}" vardiyasını silmek istediğinizden emin misiniz?`)) return;
    try {
      const res = await fetch(`/api/shift-templates/${shift.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Silme işlemi başarısız");
      await fetchShifts();
    } catch {
      alert("Vardiya silinirken bir hata oluştu.");
    }
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Vardiya Yönetimi</h1>
        <Button onClick={openNew}>+ Yeni Vardiya</Button>
      </div>

      {loading && <p className="text-sm text-gray-500">Yükleniyor...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {["Kod", "Ad", "Başlangıç", "Bitiş", "Gece Nöbeti", "Min Dinlenme (Saat)", "Durum", "İşlemler"].map(
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
              {shifts.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    Kayıt bulunamadı.
                  </td>
                </tr>
              )}
              {shifts.map((shift) => (
                <tr key={shift.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-700">
                    <div className="flex items-center gap-2">
                      {shift.color && (
                        <span
                          className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: shift.color }}
                        />
                      )}
                      {shift.code}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{shift.name}</td>
                  <td className="px-4 py-3 text-gray-600">{shift.startTime}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {shift.endTime}
                    {shift.crossesMidnight && (
                      <span className="ml-1 text-xs text-orange-500">+1</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        shift.isNightShift
                          ? "bg-indigo-100 text-indigo-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {shift.isNightShift ? "Evet" : "Hayır"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {shift.minimumRestHoursAfter ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        shift.isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {shift.isActive ? "Aktif" : "Pasif"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openEdit(shift)}>
                        Düzenle
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleDelete(shift)}>
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
        title={editingId ? "Vardiya Düzenle" : "Yeni Vardiya"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              id="code"
              label="Kod"
              value={form.code}
              onChange={(e) => setField("code", e.target.value)}
              required
            />
            <Input
              id="name"
              label="Ad"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              id="startTime"
              label="Başlangıç Saati"
              type="time"
              value={form.startTime}
              onChange={(e) => setField("startTime", e.target.value)}
              required
            />
            <Input
              id="endTime"
              label="Bitiş Saati"
              type="time"
              value={form.endTime}
              onChange={(e) => setField("endTime", e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
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
              id="minimumRestHoursAfter"
              label="Min. Dinlenme Süresi (Saat)"
              type="number"
              min={0}
              value={form.minimumRestHoursAfter}
              onChange={(e) => setField("minimumRestHoursAfter", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Renk</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setField("color", e.target.value)}
                  className="h-9 w-16 rounded border border-gray-300 cursor-pointer p-0.5"
                />
                <span className="text-sm text-gray-500 font-mono">{form.color}</span>
              </div>
            </div>
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
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={form.crossesMidnight}
                onChange={(e) => setField("crossesMidnight", e.target.checked)}
              />
              Gece Yarısını Geçiyor
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={form.isNightShift}
                onChange={(e) => setField("isNightShift", e.target.checked)}
              />
              Gece Nöbeti
            </label>
          </div>
          <Textarea
            id="notes"
            label="Notlar"
            value={form.notes}
            onChange={(e) => setField("notes", e.target.value)}
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
