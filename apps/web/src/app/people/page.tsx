"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";

interface Person {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  notes: string | null;
}

const emptyForm = {
  code: "",
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  isActive: true,
  notes: "",
};

type FormState = typeof emptyForm;

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function fetchPeople() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/people");
      if (!res.ok) throw new Error("Veriler alınamadı");
      const data = await res.json();
      setPeople(data);
    } catch {
      setError("Personel listesi yüklenirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPeople();
  }, []);

  function openNew() {
    setForm(emptyForm);
    setEditingId(null);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(person: Person) {
    setForm({
      code: person.code,
      firstName: person.firstName,
      lastName: person.lastName,
      phone: person.phone ?? "",
      email: person.email ?? "",
      isActive: person.isActive,
      notes: person.notes ?? "",
    });
    setEditingId(person.id);
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
      const url = editingId ? `/api/people/${editingId}` : "/api/people";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? "İşlem başarısız oldu");
      }
      closeModal();
      await fetchPeople();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(person: Person) {
    if (!window.confirm(`"${person.fullName}" adlı personeli silmek istediğinizden emin misiniz?`)) return;
    try {
      const res = await fetch(`/api/people/${person.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Silme işlemi başarısız");
      await fetchPeople();
    } catch {
      alert("Personel silinirken bir hata oluştu.");
    }
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Personel Yönetimi</h1>
        <Button onClick={openNew}>+ Yeni Personel</Button>
      </div>

      {loading && <p className="text-sm text-gray-500">Yükleniyor...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {["Kod", "Ad Soyad", "Telefon", "Email", "Durum", "İşlemler"].map((h) => (
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
              {people.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    Kayıt bulunamadı.
                  </td>
                </tr>
              )}
              {people.map((person) => (
                <tr key={person.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-700">{person.code}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{person.fullName}</td>
                  <td className="px-4 py-3 text-gray-600">{person.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{person.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        person.isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {person.isActive ? "Aktif" : "Pasif"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link href={`/people/${person.id}`}>
                        <Button variant="ghost" size="sm">Detaylar</Button>
                      </Link>
                      <Button variant="secondary" size="sm" onClick={() => openEdit(person)}>
                        Düzenle
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleDelete(person)}>
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
        title={editingId ? "Personel Düzenle" : "Yeni Personel"}
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
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Durum</label>
              <Select
                id="isActive"
                value={form.isActive ? "true" : "false"}
                onChange={(e) => setField("isActive", e.target.value === "true")}
              >
                <option value="true">Aktif</option>
                <option value="false">Pasif</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              id="firstName"
              label="Ad"
              value={form.firstName}
              onChange={(e) => setField("firstName", e.target.value)}
              required
            />
            <Input
              id="lastName"
              label="Soyad"
              value={form.lastName}
              onChange={(e) => setField("lastName", e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              id="phone"
              label="Telefon"
              type="tel"
              value={form.phone}
              onChange={(e) => setField("phone", e.target.value)}
            />
            <Input
              id="email"
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
            />
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
