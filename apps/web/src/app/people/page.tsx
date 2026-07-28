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
import { PersonDetail } from "@/components/people/PersonDetail";
import { useLive, mutate } from "@/lib/db/live";
import {
  coverageRulesRepo,
  peopleRepo,
  RepoError,
  type PersonListItem,
} from "@/lib/db/repo";

function personMissingLocationAccess(
  person: PersonListItem,
  requiredLocationIds: string[]
): boolean {
  if (!person.isActive || requiredLocationIds.length === 0) return false;
  const allowed = new Set(
    person.locationRules.filter((r) => r.allowed).map((r) => r.locationId)
  );
  return requiredLocationIds.some((id) => !allowed.has(id));
}

const emptyForm = {
  code: "",
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  role: "ASISTAN",
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
  const detailId = searchParams.get("id");

  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [requiredLocationIds, setRequiredLocationIds] = useState<string[]>([]);
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

  const peopleLive = useLive(() => peopleRepo.listDetailed(), []);
  const coverageLive = useLive(() => coverageRulesRepo.list(), []);

  useEffect(() => {
    setPeople(peopleLive.data ?? []);
  }, [peopleLive.data]);

  useEffect(() => {
    const ids = [
      ...new Set(
        (coverageLive.data ?? []).filter((r) => r.isActive).map((r) => r.locationId)
      ),
    ];
    setRequiredLocationIds(ids);
  }, [coverageLive.data]);

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

  function openEdit(person: PersonListItem) {
    setForm({
      code: person.code,
      firstName: person.firstName,
      lastName: person.lastName,
      phone: person.phone ?? "",
      email: person.email ?? "",
      role: person.role ?? "ASISTAN",
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
      if (editingId) {
        await mutate(() => peopleRepo.update(editingId, form));
      } else {
        await mutate(() => peopleRepo.create(form));
      }
      closeModal();
    } catch (err) {
      setFormError(err instanceof RepoError ? err.message : "Bir hata oluştu");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(person: PersonListItem) {
    if (!window.confirm(`"${person.fullName}" adlı personeli silmek istediğinizden emin misiniz?`)) return;
    try {
      await mutate(() => peopleRepo.remove(person.id));
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
      const result = await mutate(() =>
        peopleRepo.createBulk({
          people: payload.map((row) => ({
            code: row.code,
            firstName: row.firstName,
            lastName: row.lastName,
            isActive: true,
          })),
        })
      );
      const skipped = result.skipped.length;
      setImportMessage(
        `${result.created} personel eklendi${skipped > 0 ? `, ${skipped} kayıt atlandı` : ""}.`
      );
      setPasteText("");
      setImportRows([]);
    } catch (err) {
      setImportError(err instanceof RepoError ? err.message : "Bir hata oluştu");
    } finally {
      setImporting(false);
    }
  }

  if (detailId) {
    return <PersonDetail personId={detailId} />;
  }

  const loading = peopleLive.loading;
  const error = peopleLive.error;

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
      {error && <p className="text-sm text-red-600">{error.message}</p>}

      {!loading && !error && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {["Kod", "Ad Soyad", "Unvan / Rol", "Telefon", "Email", "Durum", "İşlemler"].map((h) => (
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
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    Kayıt bulunamadı.
                  </td>
                </tr>
              )}
              {people.map((person) => (
                <tr key={person.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-700">{person.code}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{person.fullName}</td>
                  <td className="px-4 py-3 text-gray-600">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        person.role === "UZMAN"
                          ? "bg-purple-100 text-purple-800"
                          : person.role === "HEMSIRE"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {person.role === "UZMAN" ? "Uzman" : person.role === "HEMSIRE" ? "Hemşire" : "Asistan"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{person.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{person.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1 items-start">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          person.isActive
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {person.isActive ? "Aktif" : "Pasif"}
                      </span>
                      {personMissingLocationAccess(person, requiredLocationIds) && (
                        <Link
                          href={`/people?id=${person.id}`}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200"
                        >
                          Lokasyon izni eksik
                        </Link>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link href={`/people?id=${person.id}`}>
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
          <div className="grid grid-cols-3 gap-4">
            <Input
              id="code"
              label="Kod"
              value={form.code}
              onChange={(e) => setField("code", e.target.value)}
              required
            />
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Unvan / Rol</label>
              <Select
                id="role"
                value={form.role}
                onChange={(e) => setField("role", e.target.value)}
              >
                <option value="ASISTAN">Asistan</option>
                <option value="UZMAN">Uzman Doktor</option>
                <option value="HEMSIRE">Hemşire</option>
              </Select>
            </div>
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

export default function PeoplePage(): React.ReactElement {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Yükleniyor...</div>}>
      <PeoplePageInner />
    </Suspense>
  );
}
