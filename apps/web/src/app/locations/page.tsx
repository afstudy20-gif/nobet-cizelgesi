"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";
import {
  locationsRepo,
  RepoError,
  nextCopyCode,
  type LocationCreateInput,
  type LocationUpdateInput,
} from "@/lib/db/repo";
import type { Location } from "@/lib/db/types";
import { useLive, mutate } from "@/lib/db/live";

const emptyForm = {
  code: "",
  name: "",
  address: "",
  isActive: true,
  notes: "",
};

type FormState = typeof emptyForm;

export default function LocationsPage() {
  const { data: locations, loading, error } = useLive<Location[]>(() => locationsRepo.list(), []);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function openNew() {
    setForm(emptyForm);
    setEditingId(null);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(loc: Location) {
    setForm({
      code: loc.code,
      name: loc.name,
      address: loc.address ?? "",
      isActive: loc.isActive,
      notes: loc.notes ?? "",
    });
    setEditingId(loc.id);
    setFormError(null);
    setModalOpen(true);
  }

  function openCopy(loc: Location) {
    setForm({
      code: nextCopyCode(locations?.map((l) => l.code) ?? [], loc.code),
      name: `${loc.name} (kopya)`,
      address: loc.address ?? "",
      isActive: loc.isActive,
      notes: loc.notes ?? "",
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
      const payload: LocationCreateInput = {
        code: form.code,
        name: form.name,
        address: form.address || null,
        isActive: form.isActive,
        notes: form.notes || null,
      };
      if (editingId) {
        await mutate(() => locationsRepo.update(editingId, payload as LocationUpdateInput));
      } else {
        await mutate(() => locationsRepo.create(payload));
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

  async function handleDelete(loc: Location) {
    if (!window.confirm(`"${loc.name}" lokasyonunu silmek istediğinizden emin misiniz?`)) return;
    try {
      await mutate(() => locationsRepo.remove(loc.id));
    } catch {
      alert("Lokasyon silinirken bir hata oluştu.");
    }
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Lokasyon Yönetimi</h1>
        <Button onClick={openNew}>+ Yeni Lokasyon</Button>
      </div>

      {loading && <p className="text-sm text-gray-500">Yükleniyor...</p>}
      {error && <p className="text-sm text-red-600">Lokasyon listesi yüklenirken bir hata oluştu.</p>}

      {!loading && !error && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {["Kod", "Ad", "Adres", "Durum", "İşlemler"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {locations && locations.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    Kayıt bulunamadı.
                  </td>
                </tr>
              )}
              {locations?.map((loc) => (
                <tr key={loc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-700">{loc.code}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{loc.name}</td>
                  <td className="px-4 py-3 text-gray-600">{loc.address ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        loc.isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {loc.isActive ? "Aktif" : "Pasif"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openEdit(loc)}>
                        Düzenle
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openCopy(loc)}>
                        Kopyala
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleDelete(loc)}>
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
        title={editingId ? "Lokasyon Düzenle" : "Yeni Lokasyon"}
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
          <Input
            id="name"
            label="Ad"
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            required
          />
          <Input
            id="address"
            label="Adres"
            value={form.address}
            onChange={(e) => setField("address", e.target.value)}
          />
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
