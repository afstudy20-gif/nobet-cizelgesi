"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Location {
  id: string;
  code: string;
  name: string;
}

interface WorkRule {
  id: string;
  maxAssignmentsPerPeriod: number | null;
  maxNightAssignmentsPerPeriod: number | null;
  maxWeekendAssignmentsPerPeriod: number | null;
  minRestHoursBetweenAssignments: number | null;
  allowBackToBackNightShift: boolean;
}

interface LocationRule {
  id: string;
  locationId: string;
  location: Location;
  allowed: boolean;
}

interface AvailabilityRule {
  id: string;
  ruleType: "WEEKLY" | "DATE_RANGE" | "ONE_DAY";
  availabilityType: "AVAILABLE" | "UNAVAILABLE" | "PREFERRED";
  weekdays: number[];
  startTime: string | null;
  endTime: string | null;
  validFrom: string | null;
  validTo: string | null;
  notes: string | null;
}

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
  workRule: WorkRule | null;
  locationRules: LocationRule[];
  availabilityRules: AvailabilityRule[];
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

const AVAILABILITY_TYPE_LABELS: Record<string, string> = {
  AVAILABLE: "Müsait",
  UNAVAILABLE: "Müsait Değil",
  PREFERRED: "Tercihli",
};

const RULE_TYPE_LABELS: Record<string, string> = {
  WEEKLY: "Haftalık",
  DATE_RANGE: "Tarih Aralığı",
  ONE_DAY: "Tek Gün",
};

const TABS = ["Genel Bilgi", "Çalışma Kuralları", "Lokasyon İzinleri", "Müsaitlik"] as const;
type Tab = (typeof TABS)[number];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PersonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [person, setPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Genel Bilgi");

  const fetchPerson = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/people/${id}`);
      if (!res.ok) throw new Error("Personel bilgileri alınamadı");
      const data = await res.json();
      setPerson(data);
    } catch {
      setError("Personel yüklenirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPerson();
  }, [fetchPerson]);

  if (loading) return <div className="p-6 text-sm text-gray-500">Yükleniyor...</div>;
  if (error || !person)
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">{error ?? "Personel bulunamadı."}</p>
        <Link href="/people">
          <Button variant="secondary" size="sm" className="mt-4">
            ← Listeye Dön
          </Button>
        </Link>
      </div>
    );

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/people">
          <Button variant="ghost" size="sm">← Geri</Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{person.fullName}</h1>
          <p className="text-sm text-gray-500">Kod: {person.code}</p>
        </div>
        <span
          className={cn(
            "ml-auto inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
            person.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
          )}
        >
          {person.isActive ? "Aktif" : "Pasif"}
        </span>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                activeTab === tab
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "Genel Bilgi" && (
        <GeneralTab person={person} onUpdated={fetchPerson} />
      )}
      {activeTab === "Çalışma Kuralları" && (
        <WorkRulesTab personId={id} workRule={person.workRule} onUpdated={fetchPerson} />
      )}
      {activeTab === "Lokasyon İzinleri" && (
        <LocationRulesTab personId={id} rules={person.locationRules} onUpdated={fetchPerson} />
      )}
      {activeTab === "Müsaitlik" && (
        <AvailabilityTab personId={id} rules={person.availabilityRules} onUpdated={fetchPerson} />
      )}
    </div>
  );
}

// ─── General Tab ──────────────────────────────────────────────────────────────

function GeneralTab({ person, onUpdated }: { person: Person; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    firstName: person.firstName,
    lastName: person.lastName,
    phone: person.phone ?? "",
    email: person.email ?? "",
    isActive: person.isActive,
    notes: person.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/people/${person.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? "Güncelleme başarısız");
      }
      setEditing(false);
      onUpdated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="max-w-lg space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          {[
            ["Ad", person.firstName],
            ["Soyad", person.lastName],
            ["Telefon", person.phone ?? "—"],
            ["Email", person.email ?? "—"],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-gray-500 font-medium">{label}</dt>
              <dd className="text-gray-900 mt-0.5">{value}</dd>
            </div>
          ))}
        </div>
        {person.notes && (
          <div className="text-sm">
            <dt className="text-gray-500 font-medium">Notlar</dt>
            <dd className="text-gray-900 mt-0.5 whitespace-pre-wrap">{person.notes}</dd>
          </div>
        )}
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Düzenle
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="max-w-lg space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Ad"
          value={form.firstName}
          onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
          required
        />
        <Input
          label="Soyad"
          value={form.lastName}
          onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Telefon"
          type="tel"
          value={form.phone}
          onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
        />
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
        />
      </div>
      <Select
        label="Durum"
        value={form.isActive ? "true" : "false"}
        onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.value === "true" }))}
      >
        <option value="true">Aktif</option>
        <option value="false">Pasif</option>
      </Select>
      <Textarea
        label="Notlar"
        value={form.notes}
        onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
      />
      {formError && <p className="text-sm text-red-600">{formError}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
          İptal
        </Button>
      </div>
    </form>
  );
}

// ─── Work Rules Tab ───────────────────────────────────────────────────────────

function WorkRulesTab({
  personId,
  workRule,
  onUpdated,
}: {
  personId: string;
  workRule: WorkRule | null;
  onUpdated: () => void;
}) {
  const [form, setForm] = useState({
    maxAssignmentsPerPeriod: workRule?.maxAssignmentsPerPeriod?.toString() ?? "",
    maxNightAssignmentsPerPeriod: workRule?.maxNightAssignmentsPerPeriod?.toString() ?? "",
    maxWeekendAssignmentsPerPeriod: workRule?.maxWeekendAssignmentsPerPeriod?.toString() ?? "",
    minRestHoursBetweenAssignments: workRule?.minRestHoursBetweenAssignments?.toString() ?? "",
    allowBackToBackNightShift: workRule?.allowBackToBackNightShift ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const body = {
        maxAssignmentsPerPeriod: form.maxAssignmentsPerPeriod ? Number(form.maxAssignmentsPerPeriod) : null,
        maxNightAssignmentsPerPeriod: form.maxNightAssignmentsPerPeriod
          ? Number(form.maxNightAssignmentsPerPeriod)
          : null,
        maxWeekendAssignmentsPerPeriod: form.maxWeekendAssignmentsPerPeriod
          ? Number(form.maxWeekendAssignmentsPerPeriod)
          : null,
        minRestHoursBetweenAssignments: form.minRestHoursBetweenAssignments
          ? Number(form.minRestHoursBetweenAssignments)
          : null,
        allowBackToBackNightShift: form.allowBackToBackNightShift,
      };
      const res = await fetch(`/api/people/${personId}/work-rule`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? "Güncelleme başarısız");
      }
      setSaved(true);
      onUpdated();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setSaving(false);
    }
  }

  const fields: Array<{ key: keyof typeof form; label: string; type?: string }> = [
    { key: "maxAssignmentsPerPeriod", label: "Dönem Başına Maks. Görev" },
    { key: "maxNightAssignmentsPerPeriod", label: "Dönem Başına Maks. Gece Görevi" },
    { key: "maxWeekendAssignmentsPerPeriod", label: "Dönem Başına Maks. Hafta Sonu Görevi" },
    { key: "minRestHoursBetweenAssignments", label: "Görevler Arası Min. Dinlenme (Saat)" },
  ];

  return (
    <form onSubmit={handleSave} className="max-w-lg space-y-4">
      {fields.map(({ key, label }) => (
        <Input
          key={key}
          label={label}
          type="number"
          min={0}
          value={form[key] as string}
          onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
        />
      ))}
      <div className="flex items-center gap-3">
        <input
          id="allowBackToBack"
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          checked={form.allowBackToBackNightShift}
          onChange={(e) => setForm((p) => ({ ...p, allowBackToBackNightShift: e.target.checked }))}
        />
        <label htmlFor="allowBackToBack" className="text-sm font-medium text-gray-700">
          Arka Arkaya Gece Nöbetine İzin Ver
        </label>
      </div>
      {saveError && <p className="text-sm text-red-600">{saveError}</p>}
      {saved && <p className="text-sm text-green-600">Çalışma kuralları kaydedildi.</p>}
      <Button type="submit" disabled={saving}>
        {saving ? "Kaydediliyor..." : "Kaydet"}
      </Button>
    </form>
  );
}

// ─── Location Rules Tab ───────────────────────────────────────────────────────

function LocationRulesTab({
  personId,
  rules,
  onUpdated,
}: {
  personId: string;
  rules: LocationRule[];
  onUpdated: () => void;
}) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ locationId: "", allowed: true });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/locations")
      .then((r) => r.json())
      .then(setLocations)
      .catch(() => {});
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/people/${personId}/location-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? "Eklenemedi");
      }
      setModalOpen(false);
      setForm({ locationId: "", allowed: true });
      onUpdated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(ruleId: string) {
    if (!window.confirm("Bu lokasyon iznini silmek istediğinizden emin misiniz?")) return;
    try {
      const res = await fetch(`/api/people/${personId}/location-rules/${ruleId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      onUpdated();
    } catch {
      alert("Silme işlemi başarısız.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Lokasyon İzinleri</h2>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          + Ekle
        </Button>
      </div>
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Lokasyon", "Durum", "İşlem"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rules.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                  Kayıt bulunamadı.
                </td>
              </tr>
            )}
            {rules.map((rule) => (
              <tr key={rule.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">{rule.location.name}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                      rule.allowed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"
                    )}
                  >
                    {rule.allowed ? "İzinli" : "Yasak"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Button variant="danger" size="sm" onClick={() => handleDelete(rule.id)}>
                    Sil
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Lokasyon İzni Ekle">
        <form onSubmit={handleAdd} className="p-6 space-y-4">
          <Select
            label="Lokasyon"
            value={form.locationId}
            onChange={(e) => setForm((p) => ({ ...p, locationId: e.target.value }))}
            required
          >
            <option value="">— Seçiniz —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <div className="flex items-center gap-3">
            <input
              id="loc-allowed"
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              checked={form.allowed}
              onChange={(e) => setForm((p) => ({ ...p, allowed: e.target.checked }))}
            />
            <label htmlFor="loc-allowed" className="text-sm font-medium text-gray-700">
              Bu lokasyonda çalışmaya izinli
            </label>
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Ekleniyor..." : "Ekle"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── Availability Tab ─────────────────────────────────────────────────────────

const emptyAvailForm = {
  ruleType: "WEEKLY" as "WEEKLY" | "DATE_RANGE" | "ONE_DAY",
  availabilityType: "AVAILABLE" as "AVAILABLE" | "UNAVAILABLE" | "PREFERRED",
  weekdays: [] as number[],
  startTime: "",
  endTime: "",
  validFrom: "",
  validTo: "",
  notes: "",
};

function AvailabilityTab({
  personId,
  rules,
  onUpdated,
}: {
  personId: string;
  rules: AvailabilityRule[];
  onUpdated: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyAvailForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function toggleWeekday(day: number) {
    setForm((p) => ({
      ...p,
      weekdays: p.weekdays.includes(day) ? p.weekdays.filter((d) => d !== day) : [...p.weekdays, day],
    }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        ruleType: form.ruleType,
        availabilityType: form.availabilityType,
        weekdays: form.weekdays,
        startTime: form.startTime || null,
        endTime: form.endTime || null,
        validFrom: form.validFrom || null,
        validTo: form.validTo || null,
        notes: form.notes || null,
      };
      const res = await fetch(`/api/people/${personId}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? "Eklenemedi");
      }
      setModalOpen(false);
      setForm(emptyAvailForm);
      onUpdated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(ruleId: string) {
    if (!window.confirm("Bu müsaitlik kuralını silmek istediğinizden emin misiniz?")) return;
    try {
      const res = await fetch(`/api/people/${personId}/availability/${ruleId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      onUpdated();
    } catch {
      alert("Silme işlemi başarısız.");
    }
  }

  const showWeekdays = form.ruleType === "WEEKLY" || form.ruleType === "DATE_RANGE";
  const showDateRange = form.ruleType === "DATE_RANGE";
  const showSpecificDate = form.ruleType === "ONE_DAY";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Müsaitlik Kuralları</h2>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          + Ekle
        </Button>
      </div>
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Tür", "Müsaitlik", "Günler", "Saat", "Tarih Aralığı", "İşlem"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rules.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  Kayıt bulunamadı.
                </td>
              </tr>
            )}
            {rules.map((rule) => (
              <tr key={rule.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">{RULE_TYPE_LABELS[rule.ruleType]}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                      rule.availabilityType === "AVAILABLE"
                        ? "bg-green-100 text-green-800"
                        : rule.availabilityType === "PREFERRED"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-red-100 text-red-700"
                    )}
                  >
                    {AVAILABILITY_TYPE_LABELS[rule.availabilityType]}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {rule.weekdays.length > 0
                    ? rule.weekdays
                        .sort((a, b) => a - b)
                        .map((d) => WEEKDAY_LABELS[d])
                        .join(", ")
                    : "—"}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {rule.startTime && rule.endTime ? `${rule.startTime} – ${rule.endTime}` : "—"}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {rule.validFrom ?? rule.validTo
                    ? `${rule.validFrom ?? ""} – ${rule.validTo ?? ""}`
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <Button variant="danger" size="sm" onClick={() => handleDelete(rule.id)}>
                    Sil
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setForm(emptyAvailForm);
          setFormError(null);
        }}
        title="Müsaitlik Kuralı Ekle"
        size="lg"
      >
        <form onSubmit={handleAdd} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Kural Tipi"
              value={form.ruleType}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  ruleType: e.target.value as typeof form.ruleType,
                  weekdays: [],
                }))
              }
            >
              <option value="WEEKLY">Haftalık</option>
              <option value="DATE_RANGE">Tarih Aralığı</option>
              <option value="ONE_DAY">Tek Gün</option>
            </Select>
            <Select
              label="Müsaitlik Tipi"
              value={form.availabilityType}
              onChange={(e) =>
                setForm((p) => ({ ...p, availabilityType: e.target.value as typeof form.availabilityType }))
              }
            >
              <option value="AVAILABLE">Müsait</option>
              <option value="UNAVAILABLE">Müsait Değil</option>
              <option value="PREFERRED">Tercihli</option>
            </Select>
          </div>

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
              value={form.validFrom}
              onChange={(e) => setForm((p) => ({ ...p, validFrom: e.target.value, validTo: e.target.value }))}
            />
          )}

          {showDateRange && (
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Başlangıç Tarihi"
                type="date"
                value={form.validFrom}
                onChange={(e) => setForm((p) => ({ ...p, validFrom: e.target.value }))}
              />
              <Input
                label="Bitiş Tarihi"
                type="date"
                value={form.validTo}
                onChange={(e) => setForm((p) => ({ ...p, validTo: e.target.value }))}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Başlangıç Saati"
              type="time"
              value={form.startTime}
              onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}
            />
            <Input
              label="Bitiş Saati"
              type="time"
              value={form.endTime}
              onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
            />
          </div>

          <Textarea
            label="Notlar"
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          />

          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setModalOpen(false);
                setForm(emptyAvailForm);
                setFormError(null);
              }}
            >
              İptal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Ekleniyor..." : "Ekle"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
