"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Period {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
}

interface Person {
  id: string;
  fullName: string;
  code: string;
}

interface ShiftTemplate {
  id: string;
  name: string;
  code: string;
}

interface Location {
  id: string;
  name: string;
  code: string;
}

interface ShiftRequirement {
  id: string;
  shiftTemplate: ShiftTemplate;
  location: Location;
}

interface Assignment {
  id: string;
  date: string;
  status: string;
  isLocked: boolean;
  person: Person | null;
  shiftRequirement: ShiftRequirement;
}

interface ConflictLog {
  id: string;
  type: string;
  severity: "WARNING" | "ERROR";
  message: string;
}

interface ScheduleData {
  assignments: Assignment[];
  conflictLogs: ConflictLog[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
  });
}

// ─── Edit Modal ──────────────────────────────────────────────────────────────

interface EditModalProps {
  assignment: Assignment | null;
  people: Person[];
  onClose: () => void;
  onSaved: () => void;
}

function EditAssignmentModal({ assignment, people, onClose, onSaved }: EditModalProps) {
  const [selectedPersonId, setSelectedPersonId] = useState(assignment?.person?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedPersonId(assignment?.person?.id ?? "");
    setError(null);
  }, [assignment]);

  async function handleSave() {
    if (!assignment) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/assignments/${assignment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: selectedPersonId || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? "Kaydetme başarısız");
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={assignment !== null}
      onClose={onClose}
      title="Atama Düzenle"
      size="md"
    >
      <div className="p-6 space-y-4">
        {assignment && (
          <div className="text-sm text-gray-600 space-y-1">
            <p>
              <span className="font-medium">Tarih:</span> {formatDate(assignment.date)}
            </p>
            <p>
              <span className="font-medium">Lokasyon:</span>{" "}
              {assignment.shiftRequirement.location.name}
            </p>
            <p>
              <span className="font-medium">Vardiya:</span>{" "}
              {assignment.shiftRequirement.shiftTemplate.name}
            </p>
          </div>
        )}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Personel</label>
          <Select
            id="person"
            value={selectedPersonId}
            onChange={(e) => setSelectedPersonId(e.target.value)}
          >
            <option value="">— Boş —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName} ({p.code})
              </option>
            ))}
          </Select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            İptal
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Table View ──────────────────────────────────────────────────────────────

interface TableViewProps {
  assignments: Assignment[];
  onCellClick: (assignment: Assignment) => void;
  onToggleLock: (assignment: Assignment) => void;
  lockingIds: Set<string>;
}

function TableView({ assignments, onCellClick, onToggleLock, lockingIds }: TableViewProps) {
  // Build unique dates and unique (location+shift) columns
  const dateSet = new Set<string>();
  const colKeySet = new Set<string>();

  for (const a of assignments) {
    dateSet.add(a.date.split("T")[0]);
    colKeySet.add(
      `${a.shiftRequirement.location.id}__${a.shiftRequirement.shiftTemplate.id}`
    );
  }

  const dates = Array.from(dateSet).sort();
  const colKeys = Array.from(colKeySet);

  // Map colKey to label
  const colLabels: Record<string, string> = {};
  for (const a of assignments) {
    const key = `${a.shiftRequirement.location.id}__${a.shiftRequirement.shiftTemplate.id}`;
    colLabels[key] = `${a.shiftRequirement.location.name} / ${a.shiftRequirement.shiftTemplate.code}`;
  }

  // Build lookup: date -> colKey -> assignments[]
  const lookup: Record<string, Record<string, Assignment[]>> = {};
  for (const a of assignments) {
    const d = a.date.split("T")[0];
    const k = `${a.shiftRequirement.location.id}__${a.shiftRequirement.shiftTemplate.id}`;
    if (!lookup[d]) lookup[d] = {};
    if (!lookup[d][k]) lookup[d][k] = [];
    lookup[d][k].push(a);
  }

  if (dates.length === 0) {
    return <p className="text-sm text-gray-500 py-4">Atama bulunamadı.</p>;
  }

  return (
    <div className="overflow-auto">
      <table className="min-w-full divide-y divide-gray-200 text-xs border border-gray-200 rounded-lg">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap sticky left-0 bg-gray-50 z-10">
              Tarih
            </th>
            {colKeys.map((k) => (
              <th key={k} className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">
                {colLabels[k]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {dates.map((date, i) => (
            <tr key={date} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              <td className="px-3 py-2 font-medium text-gray-700 whitespace-nowrap sticky left-0 bg-inherit z-10">
                {shortDate(date)}
              </td>
              {colKeys.map((k) => {
                const cells = lookup[date]?.[k] ?? [];
                if (cells.length === 0) {
                  return (
                    <td key={k} className="px-3 py-2 text-gray-400">
                      —
                    </td>
                  );
                }
                return (
                  <td key={k} className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      {cells.map((a) => (
                        <div key={a.id} className="flex items-center gap-1">
                          <button
                            onClick={() => onCellClick(a)}
                            className={`text-left px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
                              a.status === "UNFILLED"
                                ? "bg-red-100 text-red-700 hover:bg-red-200"
                                : "bg-blue-50 text-blue-800 hover:bg-blue-100"
                            }`}
                          >
                            {a.person ? a.person.fullName : "Boş"}
                          </button>
                          <button
                            onClick={() => onToggleLock(a)}
                            disabled={lockingIds.has(a.id)}
                            title={a.isLocked ? "Kilidi Aç" : "Kilitle"}
                            className="text-gray-400 hover:text-gray-700 disabled:opacity-40 transition-colors"
                          >
                            {a.isLocked ? (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" />
                              </svg>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Person View ─────────────────────────────────────────────────────────────

interface PersonViewProps {
  assignments: Assignment[];
}

function PersonView({ assignments }: PersonViewProps) {
  const dateSet = new Set<string>();
  const peopleMap = new Map<string, Person>();

  for (const a of assignments) {
    dateSet.add(a.date.split("T")[0]);
    if (a.person) peopleMap.set(a.person.id, a.person);
  }

  const dates = Array.from(dateSet).sort();
  const people = Array.from(peopleMap.values()).sort((a, b) =>
    a.fullName.localeCompare(b.fullName, "tr")
  );

  // lookup: personId -> date -> shift codes
  const lookup: Record<string, Record<string, string[]>> = {};
  for (const a of assignments) {
    if (!a.person) continue;
    const d = a.date.split("T")[0];
    if (!lookup[a.person.id]) lookup[a.person.id] = {};
    if (!lookup[a.person.id][d]) lookup[a.person.id][d] = [];
    lookup[a.person.id][d].push(a.shiftRequirement.shiftTemplate.code);
  }

  if (people.length === 0) {
    return <p className="text-sm text-gray-500 py-4">Atama bulunamadı.</p>;
  }

  return (
    <div className="overflow-auto">
      <table className="min-w-full divide-y divide-gray-200 text-xs border border-gray-200 rounded-lg">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap sticky left-0 bg-gray-50 z-10">
              Personel
            </th>
            {dates.map((d) => (
              <th key={d} className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">
                {shortDate(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {people.map((person, i) => (
            <tr key={person.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap sticky left-0 bg-inherit z-10">
                {person.fullName}
              </td>
              {dates.map((d) => {
                const codes = lookup[person.id]?.[d];
                return (
                  <td key={d} className="px-3 py-2 text-center text-gray-700">
                    {codes ? codes.join(", ") : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

function SchedulePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const periodId = searchParams.get("periodId");

  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(true);

  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const [people, setPeople] = useState<Person[]>([]);
  const [activeTab, setActiveTab] = useState<"table" | "person">("table");

  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [lockingIds, setLockingIds] = useState<Set<string>>(new Set());

  // Fetch periods list
  useEffect(() => {
    async function loadPeriods() {
      setPeriodsLoading(true);
      try {
        const res = await fetch("/api/periods");
        if (res.ok) {
          const data = await res.json();
          setPeriods(data);
        }
      } finally {
        setPeriodsLoading(false);
      }
    }
    loadPeriods();
  }, []);

  // Fetch people list for edit modal
  useEffect(() => {
    async function loadPeople() {
      try {
        const res = await fetch("/api/people");
        if (res.ok) {
          const data = await res.json();
          setPeople(data);
        }
      } catch {
        // ignore
      }
    }
    loadPeople();
  }, []);

  // Fetch schedule when periodId changes
  useEffect(() => {
    if (!periodId) {
      setSchedule(null);
      return;
    }
    async function loadSchedule() {
      setScheduleLoading(true);
      setScheduleError(null);
      try {
        const res = await fetch(`/api/periods/${periodId}/schedule`);
        if (!res.ok) throw new Error("Çizelge yüklenemedi");
        const data = await res.json();
        setSchedule(data);
      } catch {
        setScheduleError("Çizelge yüklenirken bir hata oluştu.");
      } finally {
        setScheduleLoading(false);
      }
    }
    loadSchedule();
  }, [periodId]);

  async function reloadSchedule() {
    if (!periodId) return;
    setScheduleLoading(true);
    setScheduleError(null);
    try {
      const res = await fetch(`/api/periods/${periodId}/schedule`);
      if (!res.ok) throw new Error("Çizelge yüklenemedi");
      const data = await res.json();
      setSchedule(data);
    } catch {
      setScheduleError("Çizelge yüklenirken bir hata oluştu.");
    } finally {
      setScheduleLoading(false);
    }
  }

  async function handleToggleLock(assignment: Assignment) {
    if (lockingIds.has(assignment.id)) return;
    setLockingIds((prev) => new Set(prev).add(assignment.id));
    try {
      const action = assignment.isLocked ? "unlock" : "lock";
      await fetch(`/api/assignments/${assignment.id}/${action}`, { method: "POST" });
      await reloadSchedule();
    } finally {
      setLockingIds((prev) => {
        const next = new Set(prev);
        next.delete(assignment.id);
        return next;
      });
    }
  }

  // Compute summary
  const summary = schedule
    ? (() => {
        const total = schedule.assignments.length;
        const assigned = schedule.assignments.filter(
          (a) => a.status === "ASSIGNED" && a.person !== null
        ).length;
        const empty = schedule.assignments.filter(
          (a) => a.status === "UNFILLED" || a.person === null
        ).length;
        const conflicts = schedule.conflictLogs.length;
        return { total, assigned, empty, conflicts };
      })()
    : null;

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Nöbet Çizelgesi</h1>

      {/* Period selector */}
      {!periodId && (
        <div className="max-w-sm">
          {periodsLoading ? (
            <p className="text-sm text-gray-500">Dönemler yükleniyor...</p>
          ) : (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Dönem Seçin</label>
              <Select
                id="period"
                value=""
                onChange={(e) => {
                  if (e.target.value) router.push(`/schedule?periodId=${e.target.value}`);
                }}
              >
                <option value="">— Dönem seçin —</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({new Date(p.startDate).toLocaleDateString("tr-TR")} –{" "}
                    {new Date(p.endDate).toLocaleDateString("tr-TR")})
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
      )}

      {periodId && (
        <>
          {/* Period picker when already selected */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-72">
              <Select
                id="period-switch"
                value={periodId}
                onChange={(e) => {
                  if (e.target.value) router.push(`/schedule?periodId=${e.target.value}`);
                }}
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button variant="ghost" size="sm" onClick={() => router.push("/schedule")}>
              Temizle
            </Button>
          </div>

          {/* Summary bar */}
          {summary && (
            <div className="flex items-center gap-6 mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
              <span>
                Toplam <strong>{summary.total}</strong>
              </span>
              <span>
                Atandı <strong className="text-green-700">{summary.assigned}</strong>
              </span>
              <span>
                Boş <strong className="text-red-700">{summary.empty}</strong>
              </span>
              <span>
                Çakışma <strong className="text-yellow-700">{summary.conflicts}</strong>
              </span>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mb-4 border-b border-gray-200">
            {(["table", "person"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab === "table" ? "Tablo Görünümü" : "Kişi Görünümü"}
              </button>
            ))}
          </div>

          {scheduleLoading && <p className="text-sm text-gray-500">Yükleniyor...</p>}
          {scheduleError && <p className="text-sm text-red-600">{scheduleError}</p>}

          {!scheduleLoading && !scheduleError && schedule && (
            <>
              {activeTab === "table" && (
                <TableView
                  assignments={schedule.assignments}
                  onCellClick={setEditingAssignment}
                  onToggleLock={handleToggleLock}
                  lockingIds={lockingIds}
                />
              )}
              {activeTab === "person" && (
                <PersonView assignments={schedule.assignments} />
              )}

              {/* Conflict log */}
              {schedule.conflictLogs.length > 0 && (
                <div className="mt-8">
                  <h2 className="text-sm font-semibold text-gray-700 mb-3">Çakışma Kayıtları</h2>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          {["Tür", "Önem", "Mesaj"].map((h) => (
                            <th
                              key={h}
                              className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {schedule.conflictLogs.map((log) => (
                          <tr key={log.id}>
                            <td className="px-4 py-3 text-gray-700 font-mono text-xs">
                              {log.type}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  log.severity === "ERROR"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-yellow-100 text-yellow-700"
                                }`}
                              >
                                {log.severity === "ERROR" ? "Hata" : "Uyarı"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-600">{log.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      <EditAssignmentModal
        assignment={editingAssignment}
        people={people}
        onClose={() => setEditingAssignment(null)}
        onSaved={reloadSchedule}
      />
    </div>
  );
}

export default function SchedulePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Yükleniyor...</div>}>
      <SchedulePageInner />
    </Suspense>
  );
}
