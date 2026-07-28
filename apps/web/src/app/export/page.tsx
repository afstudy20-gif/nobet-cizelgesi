"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";
import { useI18n } from "@/i18n/I18nProvider";
import {
  exportTemplatesRepo,
  locationsRepo,
  schedulePeriodsRepo,
  type ExportTemplateCreateInput,
} from "@/lib/db/repo";
import type { ExportTemplate as RepoExportTemplate } from "@/lib/db/types";
import { mutate } from "@/lib/db/live";
import { exportSchedule } from "@/lib/export";

interface Period {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

interface Location {
  id: string;
  name: string;
}

type ViewMode = "grid" | "person" | "location";
type ExportFormat = "EXCEL" | "WORD" | "PDF";

interface ExportTemplate {
  id: string;
  name: string;
  description: string | null;
  format: ExportFormat;
  sourceType: "BUILTIN" | "CUSTOM" | "UPLOADED";
  hospitalName: string | null;
  titleTemplate: string;
  config: {
    view?: ViewMode;
    includeSummary?: boolean;
    includeConflicts?: boolean;
  };
  fileName: string | null;
  hasFile: boolean;
  isDefault: boolean;
}

const emptyTemplateForm = {
  name: "",
  description: "",
  format: "EXCEL" as ExportFormat,
  hospitalName: "",
  titleTemplate: "{{hospital}} — {{month}} {{year}} Nöbet Çizelgesi",
  view: "grid" as ViewMode,
  includeSummary: true,
  includeConflicts: true,
  isDefault: false,
};

function monthFromPeriod(period: Period | undefined): string {
  if (!period) return "";
  return period.startDate.slice(0, 7);
}

function defaultTemplateId(templates: ExportTemplate[], format: ExportFormat): string {
  return templates.find((t) => t.format === format && t.isDefault)?.id ?? "";
}

function toPageTemplate(template: RepoExportTemplate): ExportTemplate {
  const config = (template.config ?? {}) as ExportTemplate["config"];
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    format: template.format,
    sourceType: template.sourceType,
    hospitalName: template.hospitalName,
    titleTemplate: template.titleTemplate,
    config,
    fileName: template.fileName,
    hasFile: Boolean(template.fileData),
    isDefault: template.isDefault,
  };
}

export default function ExportPage() {
  const { t, locale } = useI18n();
  const dateLocale = locale === "en" ? "en-GB" : "tr-TR";

  const [periods, setPeriods] = useState<Period[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [templates, setTemplates] = useState<ExportTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [hospitalName, setHospitalName] = useState("");
  const [workingMonth, setWorkingMonth] = useState("");
  const [excelTemplateId, setExcelTemplateId] = useState("");
  const [wordTemplateId, setWordTemplateId] = useState("");
  const [pdfTemplateId, setPdfTemplateId] = useState("");
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeConflicts, setIncludeConflicts] = useState(true);
  const [view, setView] = useState<ViewMode>("grid");
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);

  const templatesByFormat = useMemo(
    () => ({
      EXCEL: templates.filter((t) => t.format === "EXCEL"),
      WORD: templates.filter((t) => t.format === "WORD"),
      PDF: templates.filter((t) => t.format === "PDF"),
    }),
    [templates]
  );

  async function loadData() {
    setLoading(true);
    try {
      const [periodList, locList, templateList] = await Promise.all([
        schedulePeriodsRepo.list(),
        locationsRepo.list({ isActive: true }),
        exportTemplatesRepo.list(),
      ]);
      setPeriods(periodList);
      if (periodList.length > 0) {
        setSelectedPeriodId((prev) => prev || periodList[0].id);
      }
      setLocations(locList);
      const mapped = templateList.map(toPageTemplate);
      setTemplates(mapped);
      setExcelTemplateId((prev) => prev || defaultTemplateId(mapped, "EXCEL"));
      setWordTemplateId((prev) => prev || defaultTemplateId(mapped, "WORD"));
      setPdfTemplateId((prev) => prev || defaultTemplateId(mapped, "PDF"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedPeriod) {
      setWorkingMonth(monthFromPeriod(selectedPeriod));
    }
  }, [selectedPeriod]);

  useEffect(() => {
    const excelTemplate = templates.find((t) => t.id === excelTemplateId);
    if (!excelTemplate) return;
    const cfg = excelTemplate.config ?? {};
    if (cfg.view) setView(cfg.view);
    if (cfg.includeSummary !== undefined) setIncludeSummary(cfg.includeSummary);
    if (cfg.includeConflicts !== undefined) setIncludeConflicts(cfg.includeConflicts);
    if (excelTemplate.hospitalName && !hospitalName) {
      setHospitalName(excelTemplate.hospitalName);
    }
  }, [excelTemplateId, templates, hospitalName]);

  function templateIdFor(format: ExportFormat): string | undefined {
    const id =
      format === "EXCEL"
        ? excelTemplateId
        : format === "WORD"
          ? wordTemplateId
          : pdfTemplateId;
    return id || undefined;
  }

  async function runExport(format: ExportFormat) {
    if (!selectedPeriodId) return;
    setExporting(format);
    setExportError(null);
    try {
      await exportSchedule(selectedPeriodId, format, {
        view,
        includeSummary,
        includeConflicts,
        locale,
        hospitalName: hospitalName.trim() || undefined,
        workingMonth: workingMonth || undefined,
        templateId: templateIdFor(format),
      });
    } catch (e) {
      setExportError(e instanceof Error ? e.message : t("export.errorGeneric"));
    } finally {
      setExporting(null);
    }
  }

  function handleExcelDownload() {
    void runExport("EXCEL");
  }

  function handleWordDownload() {
    void runExport("WORD");
  }

  function handlePdfDownload() {
    void runExport("PDF");
  }

  function openNewTemplate(format?: ExportFormat) {
    setEditingTemplateId(null);
    setTemplateForm({
      ...emptyTemplateForm,
      format: format ?? "EXCEL",
      hospitalName: hospitalName || "",
    });
    setUploadFile(null);
    setTemplateError(null);
    setTemplateModalOpen(true);
  }

  function openEditTemplate(template: ExportTemplate) {
    setEditingTemplateId(template.id);
    setTemplateForm({
      name: template.name,
      description: template.description ?? "",
      format: template.format,
      hospitalName: template.hospitalName ?? "",
      titleTemplate: template.titleTemplate,
      view: template.config?.view ?? "grid",
      includeSummary: template.config?.includeSummary ?? true,
      includeConflicts: template.config?.includeConflicts ?? true,
      isDefault: template.isDefault,
    });
    setUploadFile(null);
    setTemplateError(null);
    setTemplateModalOpen(true);
  }

  async function saveTemplate() {
    setTemplateSaving(true);
    setTemplateError(null);
    try {
      const payload: ExportTemplateCreateInput = {
        name: templateForm.name,
        description: templateForm.description || null,
        format: templateForm.format,
        hospitalName: templateForm.hospitalName || null,
        titleTemplate: templateForm.titleTemplate,
        isDefault: templateForm.isDefault,
        config: {
          view: templateForm.view,
          includeSummary: templateForm.includeSummary,
          includeConflicts: templateForm.includeConflicts,
        },
      };

      const saved = await mutate(() =>
        editingTemplateId != null
          ? exportTemplatesRepo.update(editingTemplateId, payload)
          : exportTemplatesRepo.create(payload)
      );

      if (uploadFile && (saved.format === "EXCEL" || saved.format === "WORD")) {
        await mutate(() => exportTemplatesRepo.uploadFile(saved.id, uploadFile));
      }

      setTemplateModalOpen(false);
      await loadData();
      if (saved.format === "EXCEL") setExcelTemplateId(saved.id);
      if (saved.format === "WORD") setWordTemplateId(saved.id);
      if (saved.format === "PDF") setPdfTemplateId(saved.id);
    } catch (e) {
      setTemplateError(e instanceof Error ? e.message : t("export.errorGeneric"));
    } finally {
      setTemplateSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!window.confirm(t("export.confirmDelete"))) return;
    try {
      await mutate(() => exportTemplatesRepo.remove(id));
    } catch (e) {
      alert(e instanceof Error ? e.message : t("export.errorDelete"));
      return;
    }
    if (excelTemplateId === id) setExcelTemplateId("");
    if (wordTemplateId === id) setWordTemplateId("");
    if (pdfTemplateId === id) setPdfTemplateId("");
    await loadData();
  }

  function renderTemplateSelect(
    label: string,
    format: ExportFormat,
    value: string,
    onChange: (id: string) => void
  ) {
    const list = templatesByFormat[format];
    const active = list.find((t) => t.id === value);

    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <Select id={`template-${format}`} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t("export.templateDefault")}</option>
          {list.map((tmpl) => (
            <option key={tmpl.id} value={tmpl.id}>
              {tmpl.name}
              {tmpl.hasFile ? t("export.templateWithFile") : ""}
            </option>
          ))}
        </Select>
        {active && (
          <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-2 space-y-1">
            <p>
              <strong>{t("export.templateTitle")}</strong> {active.titleTemplate}
            </p>
            {active.hasFile && (
              <p>
                <strong>{t("export.templateFile")}</strong> {active.fileName}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" onClick={() => openEditTemplate(active)}>
                {t("export.edit")}
              </Button>
              {active.sourceType !== "BUILTIN" && (
                <Button variant="secondary" onClick={() => deleteTemplate(active.id)}>
                  {t("export.delete")}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-2">{t("export.title")}</h1>
      <p className="text-sm text-gray-500 mb-6">{t("export.subtitle")}</p>

      {loading ? (
        <p className="text-sm text-gray-500">{t("export.loading")}</p>
      ) : (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("export.period")}</label>
            <Select
              id="period"
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
            >
              <option value="">{t("export.periodPlaceholder")}</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({new Date(p.startDate).toLocaleDateString(dateLocale)} –{" "}
                  {new Date(p.endDate).toLocaleDateString(dateLocale)})
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("export.hospital")}</label>
              <Input
                id="hospital"
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
                placeholder={t("export.hospitalPlaceholder")}
                list="hospital-options"
              />
              <datalist id="hospital-options">
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.name} />
                ))}
              </datalist>
              <p className="text-xs text-gray-400 mt-1">{t("export.hospitalHint")}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("export.workingMonth")}
              </label>
              <Input
                id="workingMonth"
                type="month"
                value={workingMonth}
                onChange={(e) => setWorkingMonth(e.target.value)}
              />
            </div>
          </div>

          <div className="card card-body space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">{t("export.templatesTitle")}</p>
                <p className="text-xs text-gray-500">{t("export.templatesSubtitle")}</p>
              </div>
              <Button variant="secondary" onClick={() => openNewTemplate()}>
                {t("export.newTemplate")}
              </Button>
            </div>

            <p className="text-xs text-gray-500">{t("export.templatePlaceholders")}</p>

            {renderTemplateSelect(t("export.excelTemplate"), "EXCEL", excelTemplateId, setExcelTemplateId)}
            {renderTemplateSelect(t("export.wordTemplate"), "WORD", wordTemplateId, setWordTemplateId)}
            {renderTemplateSelect(t("export.pdfTemplate"), "PDF", pdfTemplateId, setPdfTemplateId)}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t("export.view")}</label>
            <div className="flex flex-wrap gap-4">
              {(
                [
                  { value: "grid", label: t("export.viewGrid") },
                  { value: "person", label: t("export.viewPerson") },
                  { value: "location", label: t("export.viewLocation") },
                ] as { value: ViewMode; label: string }[]
              ).map(({ value, label }) => (
                <label key={value} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="view"
                    value={value}
                    checked={view === value}
                    onChange={() => setView(value)}
                    className="text-blue-600"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">{t("export.options")}</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={includeSummary}
                  onChange={(e) => setIncludeSummary(e.target.checked)}
                  className="rounded text-blue-600"
                />
                {t("export.includeSummary")}
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={includeConflicts}
                  onChange={(e) => setIncludeConflicts(e.target.checked)}
                  className="rounded text-blue-600"
                />
                {t("export.includeConflicts")}
              </label>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">{t("export.download")}</p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="primary"
                onClick={handleExcelDownload}
                disabled={!selectedPeriodId || exporting !== null}
              >
                {exporting === "EXCEL" ? t("export.saving") : t("export.downloadExcel")}
              </Button>
              <Button
                variant="secondary"
                onClick={handlePdfDownload}
                disabled={!selectedPeriodId || exporting !== null}
              >
                {exporting === "PDF" ? t("export.saving") : t("export.downloadPdf")}
              </Button>
              <Button
                variant="secondary"
                onClick={handleWordDownload}
                disabled={!selectedPeriodId || exporting !== null}
              >
                {exporting === "WORD" ? t("export.saving") : t("export.downloadWord")}
              </Button>
            </div>
            {!selectedPeriodId && (
              <p className="text-xs text-gray-400 mt-2">{t("export.selectPeriodHint")}</p>
            )}
            {exportError && <p className="text-sm text-red-600 mt-2">{exportError}</p>}
          </div>

          {selectedPeriod && (
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
              <strong>{selectedPeriod.name}</strong> —{" "}
              {hospitalName || t("export.previewNoHospital")}, {workingMonth || monthFromPeriod(selectedPeriod)}
            </div>
          )}
        </div>
      )}

      <Modal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        title={editingTemplateId ? t("export.modalEdit") : t("export.modalNew")}
      >
        <div className="space-y-4">
          <Input
            label={t("export.templateName")}
            value={templateForm.name}
            onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Textarea
            label={t("export.templateDesc")}
            value={templateForm.description}
            onChange={(e) => setTemplateForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
          />
          <Select
            label={t("export.format")}
            value={templateForm.format}
            onChange={(e) =>
              setTemplateForm((f) => ({ ...f, format: e.target.value as ExportFormat }))
            }
            disabled={Boolean(editingTemplateId)}
          >
            <option value="EXCEL">Excel</option>
            <option value="WORD">Word</option>
            <option value="PDF">PDF</option>
          </Select>
          <Input
            label={t("export.defaultHospital")}
            value={templateForm.hospitalName}
            onChange={(e) => setTemplateForm((f) => ({ ...f, hospitalName: e.target.value }))}
          />
          <Input
            label={t("export.titleTemplate")}
            value={templateForm.titleTemplate}
            onChange={(e) => setTemplateForm((f) => ({ ...f, titleTemplate: e.target.value }))}
          />
          {templateForm.format === "EXCEL" && (
            <>
              <Select
                label={t("export.defaultView")}
                value={templateForm.view}
                onChange={(e) =>
                  setTemplateForm((f) => ({ ...f, view: e.target.value as ViewMode }))
                }
              >
                <option value="grid">{t("export.viewTable")}</option>
                <option value="person">{t("export.viewPerson")}</option>
                <option value="location">{t("export.viewLocation")}</option>
              </Select>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("export.excelFile")}
                </label>
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-600"
                />
                <p className="text-xs text-gray-400 mt-1">{t("export.excelFileHint")}</p>
              </div>
            </>
          )}
          {templateForm.format === "WORD" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("export.wordFile")}
              </label>
              <input
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-600"
              />
              <p className="text-xs text-gray-400 mt-1">{t("export.wordFileHint")}</p>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={templateForm.isDefault}
              onChange={(e) => setTemplateForm((f) => ({ ...f, isDefault: e.target.checked }))}
              className="rounded text-blue-600"
            />
            {t("export.defaultForFormat")}
          </label>
          {templateError && <p className="text-sm text-red-600">{templateError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setTemplateModalOpen(false)}>
              {t("export.cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={saveTemplate}
              disabled={templateSaving || !templateForm.name.trim()}
            >
              {templateSaving ? t("export.saving") : t("export.save")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
