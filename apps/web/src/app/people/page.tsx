"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { parsePersonNamesFromText, suggestPersonCodes } from "@nobet/shared";
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

type ImportRow = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  code: string;
  selected: boolean;
  duplicate: boolean;
};

function PeoplePageInner() {
  const searchParams = useSearchParams();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [pasteText, setPasteText] = useState("");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

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

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      openNew();
    }
  }, [searchParams]);

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

  const existingNameKeys = useMemo(
    () => new Set(people.map((p) => p.fullName.toLocaleLowerCase("tr"))),
    [people]
  );

  useEffect(() => {
    const parsed = parsePersonNamesFromText(pasteText);
    const codes = suggestPersonCodes(
      people.map((p) => p.code),
      parsed.length
    );
    setImportRows(
      parsed.map((row, index) => ({
        id: `${row.fullName}-${index}`,
        firstName: row.firstName,
        lastName: row.lastName,
        fullName: row.fullName,
        code: codes[index] ?? "",
        selected: !existingNameKeys.has(row.fullName.toLocaleLowerCase("tr")),
        duplicate: existingNameKeys.has(row.fullName.toLocaleLowerCase("tr")),
      }))
    );
    setImportMessage(null);
    setImportError(null);
  }, [pasteText, people, existingNameKeys]);

  const selectedImportCount = importRows.filter((r) => r.selected && !r.duplicate).length;

  function updateImportRow(id: string, patch: Partial<ImportRow>) {
    setImportRows((rows) =>
      rows.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if (patch.firstName !== undefined || patch.lastName !== undefined) {
          next.fullName = `${next.firstName} ${next.lastName}`.trim();
          next.duplicate = existingNameKeys.has(next.fullName.toLocaleLowerCase("tr"));
        }
        return next;
      })
    );
  }

  async function handleBulkImport() {
    const payload = importRows.filter((r) => r.selected && !r.duplicate);
    if (payload.length === 0) {
      setImportError("İçe aktarılacak yeni personel seçilmedi.");
      return;
    }

    setImporting(true);
    setImportError(null);
    setImportMessage(null);
    try {
      const res = await fetch("/api/people/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          people: payload.map((row) => ({
            code: row.code,
            firstName: row.firstName,
            lastName: row.lastName,
            isActive: true,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "Toplu içe aktarma başarısız oldu");
      }

      const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
      setImportMessage(
        `${data.created ?? payload.length} personel eklendi${skipped > 0 ? `, ${skipped} kayıt atlandı` : ""}.`
      );
      setPasteText("");
      setImportRows([]);
      await fetchPeople();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Personel Yönetimi</h1>
        <Button onClick={openNew}>+ Yeni Personel</Button>
      </div>

      <div className="card card-body mb-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Metinden Personel Ekle</h2>
          <p className="text-xs text-gray-500 mt-1">
            Excel, Word veya listeden kopyaladığınız metni yapıştırın. Her satırdan ad soyad
            otomatik ayrıştırılır (virgül, tab, numaralı liste desteklenir).
          </p>
        </div>
        <Textarea
          id="pastePeople"
          label="Personel listesi"
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={6}
          placeholder={`Ayşe Yılmaz\nMehmet Kaya\n1. Elif Demir\nBurak Şen, ayse@mail.com`}
        />
        {importRows.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-gray-700">
                <strong>{importRows.length}</strong> isim bulundu,{" "}
                <strong>{selectedImportCount}</strong> seçili
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setImportRows((rows) => rows.map((r) => ({ ...r, selected: !r.duplicate })))
                  }
                >
                  Tümünü Seç
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleBulkImport}
                  disabled={importing || selectedImportCount === 0}
                >
                  {importing ? "Ekleniyor..." : `${selectedImportCount} Personeli Ekle`}
                </Button>
              </div>
            </div>
            <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {["", "Kod", "Ad", "Soyad", "Durum"].map((h) => (
                      <th
                        key={h || "sel"}
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {importRows.map((row) => (
                    <tr key={row.id} className={row.duplicate ? "bg-amber-50" : undefined}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          disabled={row.duplicate}
                          onChange={(e) => updateImportRow(row.id, { selected: e.target.checked })}
                          className="rounded text-blue-600"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={row.code}
                          onChange={(e) => updateImportRow(row.id, { code: e.target.value })}
                          className="w-20 border border-gray-200 rounded px-2 py-1 text-xs font-mono"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={row.firstName}
                          onChange={(e) => updateImportRow(row.id, { firstName: e.target.value })}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={row.lastName}
                          onChange={(e) => updateImportRow(row.id, { lastName: e.target.value })}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {row.duplicate ? (
                          <span className="text-amber-700">Zaten kayıtlı</span>
                        ) : (
                          <span className="text-green-700">Yeni</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {pasteText.trim() && importRows.length === 0 && (
          <p className="text-sm text-amber-700">
            Geçerli isim bulunamadı. Her satırda en az ad ve soyad olmalıdır.
          </p>
        )}
        {importError && <p className="text-sm text-red-600">{importError}</p>}
        {importMessage && <p className="text-sm text-green-700">{importMessage}</p>}
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

export default function PeoplePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Yükleniyor...</div>}>
      <PeoplePageInner />
    </Suspense>
  );
}
