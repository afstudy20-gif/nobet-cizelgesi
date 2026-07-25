import { describe, expect, it } from "vitest";
import { BackupSchema } from "../backup-schema";

const TABLES = [
  "people",
  "locations",
  "shiftTemplates",
  "coverageRules",
  "personLocationRules",
  "personWorkRules",
  "availabilityRules",
  "schedulePeriods",
  "shiftRequirements",
  "assignments",
  "conflictLogs",
] as const;

/** Every table present and empty — the shape a wipe-and-restore of an empty DB produces. */
function emptyData(overrides: Record<string, unknown> = {}) {
  return Object.fromEntries([...TABLES.map((t) => [t, []]), ...Object.entries(overrides)]);
}

const EMPTY = { version: 2, lastModified: 0, data: emptyData() };

function backup(overrides: Record<string, unknown>) {
  return { ...EMPTY, data: emptyData(overrides) };
}

const PERSON = {
  id: "p1",
  code: "P001",
  firstName: "Ayşe",
  lastName: "Yılmaz",
  fullName: "Ayşe Yılmaz",
  phone: null,
  email: null,
  role: "UZMAN",
  isActive: true,
  notes: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

describe("BackupSchema", () => {
  it("accepts a backup whose tables are all present and empty", () => {
    const parsed = BackupSchema.parse(EMPTY);

    expect(parsed.data.people).toEqual([]);
    expect(parsed.data.assignments).toEqual([]);
    expect(parsed.data.conflictLogs).toEqual([]);
  });

  it("rejects a payload with no data object", () => {
    expect(BackupSchema.safeParse({}).success).toBe(false);
    expect(BackupSchema.safeParse(null).success).toBe(false);
    expect(BackupSchema.safeParse("nope").success).toBe(false);
    expect(BackupSchema.safeParse({ data: [] }).success).toBe(false);
  });

  it("coerces ISO date strings into Date objects", () => {
    const parsed = BackupSchema.parse(backup({ people: [PERSON] }));
    const person = parsed.data.people[0]!;

    expect(person.createdAt).toBeInstanceOf(Date);
    expect(person.createdAt.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("strips unknown columns instead of passing them to the database", () => {
    const parsed = BackupSchema.parse(
      backup({ people: [{ ...PERSON, droppedColumn: "x", isAdmin: true }] })
    );

    expect(parsed.data.people[0]).not.toHaveProperty("droppedColumn");
    expect(parsed.data.people[0]).not.toHaveProperty("isAdmin");
  });

  it("rejects rows that are missing a required column", () => {
    const withoutCode = { ...PERSON } as Partial<typeof PERSON>;
    delete withoutCode.code;

    expect(BackupSchema.safeParse(backup({ people: [withoutCode] })).success).toBe(false);
  });

  it("rejects values outside the Prisma enums", () => {
    const base = {
      id: "a1",
      periodId: "s1",
      shiftRequirementId: "r1",
      personId: null,
      date: "2026-07-01T00:00:00.000Z",
      startDateTime: "2026-07-01T08:00:00.000Z",
      endDateTime: "2026-07-01T16:00:00.000Z",
      role: null,
      isOnCall: false,
      status: "ASSIGNED",
      isLocked: false,
      source: "AUTO",
      score: null,
      notes: null,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    };

    expect(BackupSchema.safeParse(backup({ assignments: [base] })).success).toBe(true);
    expect(
      BackupSchema.safeParse(backup({ assignments: [{ ...base, status: "DELETED" }] }))
        .success
    ).toBe(false);
    expect(
      BackupSchema.safeParse(backup({ assignments: [{ ...base, source: "ROBOT" }] }))
        .success
    ).toBe(false);
  });

  it("rejects malformed HH:MM times", () => {
    const template = {
      id: "t1",
      code: "GUNDUZ",
      name: "Gündüz",
      startTime: "08:00",
      endTime: "16:00",
      crossesMidnight: false,
      requiredHeadcount: 1,
      defaultLocationId: null,
      color: null,
      isNightShift: false,
      isOnCall: false,
      minimumRestHoursAfter: 12,
      isActive: true,
    };

    expect(
      BackupSchema.safeParse(backup({ shiftTemplates: [template] })).success
    ).toBe(true);
    expect(
      BackupSchema.safeParse(backup({ shiftTemplates: [{ ...template, startTime: "25:00" }] }))
        .success
    ).toBe(false);
    expect(
      BackupSchema.safeParse(backup({ shiftTemplates: [{ ...template, endTime: "8am" }] }))
        .success
    ).toBe(false);
  });

  /**
   * Prisma rejects a literal null for a nullable Json column, so a
   * round-tripped backup would fail on restore if null were passed through.
   */
  it("normalises a null Json column to undefined", () => {
    const requirement = {
      id: "r1",
      periodId: "s1",
      date: "2026-07-01T00:00:00.000Z",
      shiftTemplateId: "t1",
      locationId: "l1",
      requiredHeadcount: 2,
      roleRequirements: null,
      priority: 0,
    };

    const parsed = BackupSchema.parse(backup({ shiftRequirements: [requirement] }));

    expect(parsed.data.shiftRequirements[0]!.roleRequirements).toBeUndefined();
  });

  it("keeps a populated Json column intact", () => {
    const parsed = BackupSchema.parse(
      backup({
        shiftRequirements: [
          {
            id: "r1",
            periodId: "s1",
            date: "2026-07-01T00:00:00.000Z",
            shiftTemplateId: "t1",
            locationId: "l1",
            requiredHeadcount: 2,
            roleRequirements: { UZMAN: 1, ASISTAN: 1 },
            priority: 0,
          },
        ],
      })
    );

    expect(parsed.data.shiftRequirements[0]!.roleRequirements).toEqual({
      UZMAN: 1,
      ASISTAN: 1,
    });
  });

  /**
   * The restore wipes each table before repopulating it, so a table that
   * defaulted to [] when absent would turn a truncated backup into a silent
   * delete of everything in it.
   */
  it("rejects a backup with a table missing rather than treating it as empty", () => {
    for (const missing of TABLES) {
      const data = emptyData();
      delete data[missing];

      expect(
        BackupSchema.safeParse({ version: 2, data }).success,
        `expected a backup without "${missing}" to be rejected`
      ).toBe(false);
    }
  });

  it("treats exportTemplates as optional, for version 1 backups", () => {
    const parsed = BackupSchema.parse(EMPTY);

    expect(parsed.data.exportTemplates).toBeUndefined();
  });

  it("decodes a base64 template file into bytes", () => {
    const contents = "PKfake-docx";
    const template = {
      id: "e1",
      name: "Kurum şablonu",
      description: null,
      format: "WORD",
      sourceType: "UPLOADED",
      hospitalName: "Şişli Etfal",
      titleTemplate: "{{hospital}} — {{month}}",
      config: { view: "grid" },
      fileName: "sablon.docx",
      fileData: Buffer.from(contents).toString("base64"),
      isDefault: true,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    };

    const parsed = BackupSchema.parse(backup({ exportTemplates: [template] }));
    const restored = parsed.data.exportTemplates![0]!;

    expect(Buffer.isBuffer(restored.fileData)).toBe(true);
    expect(restored.fileData!.toString()).toBe(contents);
    expect(restored.config).toEqual({ view: "grid" });
  });

  it("rejects a non-base64 template file", () => {
    const template = {
      id: "e1",
      name: "x",
      format: "WORD",
      sourceType: "UPLOADED",
      titleTemplate: "t",
      config: {},
      fileData: "not base64 !!!",
      isDefault: false,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    };

    expect(BackupSchema.safeParse(backup({ exportTemplates: [template] })).success).toBe(false);
  });

  it("rejects a backup version it does not understand", () => {
    expect(BackupSchema.safeParse({ ...EMPTY, version: 1 }).success).toBe(true);
    expect(BackupSchema.safeParse({ ...EMPTY, version: 2 }).success).toBe(true);
    expect(BackupSchema.safeParse({ ...EMPTY, version: 3 }).success).toBe(false);
    expect(BackupSchema.safeParse({ ...EMPTY, version: 0 }).success).toBe(false);
  });

  /** Postgres `integer`; anything wider becomes a 500 instead of a 400. */
  it("rejects a priority beyond int32", () => {
    const rule = {
      id: "plr1",
      personId: "p1",
      locationId: "l1",
      allowed: true,
      priority: 99_999_999_999,
    };

    expect(BackupSchema.safeParse(backup({ personLocationRules: [rule] })).success).toBe(false);
    expect(
      BackupSchema.safeParse(backup({ personLocationRules: [{ ...rule, priority: 5 }] })).success
    ).toBe(true);
  });

  it("rejects ISO weekdays outside 1..7", () => {
    const rule = {
      id: "c1",
      locationId: "l1",
      shiftTemplateId: "t1",
      ruleType: "WEEKLY",
      weekdays: [1, 2, 8],
      specificDate: null,
      validFrom: null,
      validTo: null,
      requiredHeadcount: 1,
      roleRequirements: null,
      priority: 0,
      isActive: true,
    };

    expect(BackupSchema.safeParse(backup({ coverageRules: [rule] })).success).toBe(
      false
    );
    expect(
      BackupSchema.safeParse(backup({ coverageRules: [{ ...rule, weekdays: [1, 2, 7] }] }))
        .success
    ).toBe(true);
  });
});
