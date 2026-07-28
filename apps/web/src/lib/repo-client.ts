import { useEffect, useRef, useState } from "react";
import { liveQuery } from "dexie";
import {
  RepoError,
  assignmentsRepo,
  availabilityRulesRepo,
  conflictLogsRepo,
  coverageRulesRepo,
  exportTemplatesRepo,
  getSetupReadiness,
  locationsRepo,
  peopleRepo,
  personLocationRulesRepo,
  personWorkRulesRepo,
  schedulePeriodsRepo,
  shiftRequirementsRepo,
  shiftTemplatesRepo,
} from "@/lib/db/repo";
import type {
  AvailabilityRuleCreateInput,
  AvailabilityRuleUpdateInput,
  CoverageRuleCreateInput,
  CoverageRuleUpdateInput,
  LocationCreateInput,
  LocationUpdateInput,
  PersonBulkCreateInput,
  PersonCreateInput,
  PersonUpdateInput,
  SchedulePeriodCreateInput,
  SchedulePeriodPatchInput,
  ShiftTemplateCreateInput,
  ShiftTemplateUpdateInput,
  AssignmentPatchInput,
} from "@/lib/db/repo";
import type { PersonLocationRule, PersonWorkRule } from "@/lib/db/types";
import { driveSync } from "@/lib/sync";

/**
 * Sayfa katmanı için repo erişimi.
 *
 * İki görevi tek yerden toplar:
 *
 * 1. Canlı veri: `useLiveData` Dexie `liveQuery`'sine abone olur. Drive'dan
 *    gelen bir pull IndexedDB'yi arka planda değiştirdiğinde sayfa tek seferlik
 *    `useEffect` çekiminde kalmaz, güncel veriyi otomatik görür.
 * 2. Yazma sonrası senkron: her mutasyon `driveSync.markDirty()` çağırır.
 *    Bunu unutan bir yazma Drive'a hiç gitmez; kullanıcı diğer cihazda eski
 *    veriyi görür. O yüzden mutasyonlar burada sarmalanır, `lib/db/repo.ts`
 *    değiştirilmez.
 */

export function useLiveData<T>(querier: () => Promise<T>): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  const querierRef = useRef(querier);
  querierRef.current = querier;

  useEffect(() => {
    const subscription = liveQuery(() => querierRef.current()).subscribe({
      next: (result) => setValue(result),
      error: () => {
        // Abonelik hatası veriyi boş göstermesin; mevcut değer korunur.
      },
    });
    return () => subscription.unsubscribe();
  }, []);

  return value;
}

/** `undefined` hâlinde true — ilk canlı yayın gelene kadar spinner göster. */
export function isLoading<T>(value: T | undefined): value is undefined {
  return value === undefined;
}

function dirty<T>(result: T): T {
  driveSync.markDirty();
  return result;
}

export const repo = {
  // ---- salt-okuma yardımcıları (senkron tetiklemez) ----
  getSetupReadiness,
  people: peopleRepo,
  locations: locationsRepo,
  shiftTemplates: shiftTemplatesRepo,
  coverageRules: coverageRulesRepo,
  personLocationRules: personLocationRulesRepo,
  personWorkRules: personWorkRulesRepo,
  availabilityRules: availabilityRulesRepo,
  schedulePeriods: schedulePeriodsRepo,
  shiftRequirements: shiftRequirementsRepo,
  assignments: assignmentsRepo,
  conflictLogs: conflictLogsRepo,
  exportTemplates: exportTemplatesRepo,

  // ---- mutasyonlar (her biri markDirty çağırır) ----
  mutations: {
    createPerson: (input: PersonCreateInput) => peopleRepo.create(input).then(dirty),
    createPeopleBulk: (input: PersonBulkCreateInput) =>
      peopleRepo.createBulk(input).then(dirty),
    updatePerson: (id: string, input: PersonUpdateInput) =>
      peopleRepo.update(id, input).then(dirty),
    removePerson: (id: string) => peopleRepo.remove(id).then(dirty),

    createLocation: (input: LocationCreateInput) =>
      locationsRepo.create(input).then(dirty),
    updateLocation: (id: string, input: LocationUpdateInput) =>
      locationsRepo.update(id, input).then(dirty),
    removeLocation: (id: string) => locationsRepo.remove(id).then(dirty),

    createShiftTemplate: (input: ShiftTemplateCreateInput) =>
      shiftTemplatesRepo.create(input).then(dirty),
    updateShiftTemplate: (id: string, input: ShiftTemplateUpdateInput) =>
      shiftTemplatesRepo.update(id, input).then(dirty),
    removeShiftTemplate: (id: string) => shiftTemplatesRepo.remove(id).then(dirty),

    createCoverageRule: (input: CoverageRuleCreateInput) =>
      coverageRulesRepo.create(input).then(dirty),
    updateCoverageRule: (id: string, input: CoverageRuleUpdateInput) =>
      coverageRulesRepo.update(id, input).then(dirty),
    removeCoverageRule: (id: string) => coverageRulesRepo.remove(id).then(dirty),

    upsertPersonLocationRule: (
      personId: string,
      input: Omit<PersonLocationRule, "id" | "updatedAt" | "personId" | "deleted">
    ) => personLocationRulesRepo.upsert(personId, input).then(dirty),
    removePersonLocationRule: (id: string) =>
      personLocationRulesRepo.remove(id).then(dirty),
    backfillMissingAccess: () =>
      personLocationRulesRepo.backfillMissingAccess().then(dirty),

    putPersonWorkRule: (
      personId: string,
      input: Omit<PersonWorkRule, "id" | "updatedAt" | "personId" | "deleted">
    ) => personWorkRulesRepo.put(personId, input).then(dirty),

    createAvailabilityRule: (personId: string, input: AvailabilityRuleCreateInput) =>
      availabilityRulesRepo.create(personId, input).then(dirty),
    updateAvailabilityRule: (id: string, input: AvailabilityRuleUpdateInput) =>
      availabilityRulesRepo.update(id, input).then(dirty),
    removeAvailabilityRule: (id: string) =>
      availabilityRulesRepo.remove(id).then(dirty),

    createPeriod: (input: SchedulePeriodCreateInput) =>
      schedulePeriodsRepo.create(input).then(dirty),
    updatePeriod: (id: string, input: SchedulePeriodPatchInput) =>
      schedulePeriodsRepo.update(id, input).then(dirty),
    removePeriod: (id: string) => schedulePeriodsRepo.remove(id).then(dirty),

    generateRequirements: (periodId: string) =>
      shiftRequirementsRepo.generateForPeriod(periodId).then(dirty),
    removeShiftRequirement: (id: string) =>
      shiftRequirementsRepo.remove(id).then(dirty),

    updateAssignment: (id: string, input: AssignmentPatchInput) =>
      assignmentsRepo.update(id, input).then(dirty),
    setAssignmentLocked: (id: string, locked: boolean) =>
      assignmentsRepo.setLocked(id, locked).then(dirty),
    removeAssignment: (id: string) => assignmentsRepo.remove(id).then(dirty),

    removeConflictLog: (id: string) => conflictLogsRepo.remove(id).then(dirty),
  },
};

/** Kullanıcıya gösterilecek hata mesajı — eski API `error.message` karşılığı. */
export function repoErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof RepoError) return error.message || fallback;
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

export { RepoError };
