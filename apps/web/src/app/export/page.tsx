"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";

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

export default function ExportPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [templates, setTemplates] = useState<ExportTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [hospitalName, setHospitalName] = useState("");
  const [workingMonth, setWorkingMonth] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeConflicts, setIncludeConflicts] = useState(true);
  const [view, setView] = useState<ViewMode>("grid");

  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);
  const activeTemplate = templates.find((t) => t.id === selectedTemplateId);

  async function loadData() {
    setLoading(true);
    try {
      const [periodRes, locRes, templateRes] = await Promise.all([
        fetch("/api/periods"),
        fetch("/api/locations"),
        fetch("/api/export-templates"),
      ]);
      if (periodRes.ok) {
        const data = await periodRes.json();
        setPeriods(data);
        if (data.length > 0) {
          setSelectedPeriodId((prev) => prev || data[0].id);
        }
      }
      if (locRes.ok) {
        const data = await locRes.json();
        setLocations(data.filter((l: Location & { isActive?: boolean }) => l.isActive !== false));
      }
      if (templateRes.ok) {
        setTemplates(await templateRes.json());
      }
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
    const defaultTemplate = templates.find((t) => t.format === "EXCEL" && t.isDefault);
    if (defaultTemplate && !selectedTemplateId) {
      setSelectedTemplateId(defaultTemplate.id);
    }
  }, [templates, selectedTemplateId]);

  useEffect(() => {
    if (!activeTemplate) return;
    const cfg = activeTemplate.config ?? {};
    if (cfg.view) setView(cfg.view);
    if (cfg.includeSummary !== undefined) setIncludeSummary(cfg.includeSummary);
    if (cfg.includeConflicts !== undefined) setIncludeConflicts(cfg.includeConflicts);
    if (activeTemplate.hospitalName && !hospitalName) {
      setHospitalName(activeTemplate.hospitalName);
    }
  }, [activeTemplate, hospitalName]);

  function buildQueryString() {
    const params = new URLSearchParams({
      view,
      includeSummary: String(includeSummary),
      includeConflicts: String(includeConflicts),
    });
    if (hospitalName.trim()) params.set("hospitalName", hospitalName.trim());
    if (workingMonth) params.set("workingMonth", workingMonth);
    if (selectedTemplateId) params.set("templateId", selectedTemplateId);
    return params.toString();
  }

  function handleExcelDownload() {
    if (!selectedPeriodId) return;
    window.open(`/api/periods/${selectedPeriodId}/export/excel?${buildQueryString()}`, "_blank");
  }

  function handleWordDownload() {
    if (!selectedPeriodId) return;
    window.open(`/api/periods/${selectedPeriodId}/export/word?${buildQueryString()}`, "_blank");
  }

  function handlePdfDownload() {
    if (!selectedPeriodId) return;
    window.open(`/api/periods/${selectedPeriodId}/export/pdf?${buildQueryString()}`, "_blank");
  }

  function openNewTemplate() {
    setEditingTemplateId(null);
    setTemplateForm({
      ...emptyTemplateForm,
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
      const payload = {
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

      const url = editingTemplateId
        ? `/api/export-templates/${editingTemplateId}`
        : "/api/export-templates";
      const method = editingTemplateId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? "Şablon kaydedilemedi");
      }
      const saved = await res.json();

      if (uploadFile && saved.format === "EXCEL") {
        const form = new FormData();
        form.append("file", uploadFile);
        const uploadRes = await fetch(`/api/export-templates/${saved.id}/upload`, {
          method: "POST",
          body: form,
        });
        if (!uploadRes.ok) {
          throw new Error("Şablon dosyası yüklenemedi");
        }
      }

      setTemplateModalOpen(false);
      await loadData();
      setSelectedTemplateId(saved.id);
    } catch (e) {
      setTemplateError(e instanceof Error ? e.message : "Bir hata oluştu");
    } finally {
      setTemplateSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!window.confirm("Bu şablonu silmek istediğinizden emin misiniz?")) return;
    const res = await fetch(`/api/export-templates/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      alert(err?.error?.message ?? "Şablon silinemedi");
      return;
    }
    if (selectedTemplateId === id) setSelectedTemplateId("");
    await loadData();
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-2">Dışa Aktar</h1>
      <p className="text-sm text-gray-500 mb-6">
        Excel, Word ve PDF çıktıları için hastane adı, çalışma ayı ve özel şablon kullanın.
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Yükleniyor...</p>
      ) : (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dönem</label>
            <Select
              id="period"
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Çalışılan Hastane</label>
              <Input
                id="hospital"
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
                placeholder="Örn. Merkez Klinik"
                list="hospital-options"
              />
              <datalist id="hospital-options">
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.name} />
                ))}
              </datalist>
              <p className="text-xs text-gray-400 mt-1">
                Listeden seçin veya yeni hastane adı yazın. Lokasyonlar sayfasından da ekleyebilirsiniz.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Çalışma Ayı</label>
              <Input
                id="workingMonth"
                type="month"
                value={workingMonth}
                onChange={(e) => setWorkingMonth(e.target.value)}
              />
            </div>
          </div>

          <div className="card card-body space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">Dışa Aktarma Şablonu</p>
                <p className="text-xs text-gray-500">
                  Başlık, görünüm ve (Excel için) yüklü .xlsx dosyası tanımlayın.
                </p>
              </div>
              <Button variant="secondary" onClick={openNewTemplate}>
                Yeni Şablon
              </Button>
            </div>

            <Select
              id="template"
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
            >
              <option value="">— Varsayılan ayarlar —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.format}
                  {t.hasFile ? ", dosyalı" : ""})
                </option>
              ))}
            </Select>

            {activeTemplate && (
              <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-3 space-y-1">
                <p>
                  <strong>Başlık:</strong> {activeTemplate.titleTemplate}
                </p>
                {activeTemplate.description && <p>{activeTemplate.description}</p>}
                {activeTemplate.hasFile && (
                  <p>
                    <strong>Dosya:</strong> {activeTemplate.fileName}
                  </p>
                )}
                <p className="text-gray-500">
                  Yer tutucular: {"{{hospital}}"}, {"{{month}}"}, {"{{year}}"}, {"{{period}}"}, {"{{title}}"}
                </p>
                <div className="flex gap-2 pt-2">
                  <Button variant="secondary" onClick={() => openEditTemplate(activeTemplate)}>
                    Düzenle
                  </Button>
                  {activeTemplate.sourceType !== "BUILTIN" && (
                    <Button variant="secondary" onClick={() => deleteTemplate(activeTemplate.id)}>
                      Sil
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Görünüm</label>
            <div className="flex flex-wrap gap-4">
              {(
                [
                  { value: "grid", label: "Tablo (Grid)" },
                  { value: "person", label: "Kişi" },
                  { value: "location", label: "Lokasyon" },
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
            <p className="text-sm font-medium text-gray-700 mb-2">Seçenekler</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={includeSummary}
                  onChange={(e) => setIncludeSummary(e.target.checked)}
                  className="rounded text-blue-600"
                />
                Özet dahil et (Excel)
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={includeConflicts}
                  onChange={(e) => setIncludeConflicts(e.target.checked)}
                  className="rounded text-blue-600"
                />
                Çakışmaları dahil et (Excel)
              </label>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">İndir</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" onClick={handleExcelDownload} disabled={!selectedPeriodId}>
                Excel İndir (.xlsx)
              </Button>
              <Button variant="secondary" onClick={handlePdfDownload} disabled={!selectedPeriodId}>
                PDF İndir (.pdf)
              </Button>
              <Button variant="secondary" onClick={handleWordDownload} disabled={!selectedPeriodId}>
                Word İndir (.docx)
              </Button>
            </div>
            {!selectedPeriodId && (
              <p className="text-xs text-gray-400 mt-2">İndirmek için önce bir dönem seçin.</p>
            )}
          </div>

          {selectedPeriod && (
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
              <strong>{selectedPeriod.name}</strong> — {hospitalName || "Hastane belirtilmedi"},{" "}
              {workingMonth || monthFromPeriod(selectedPeriod)}
            </div>
          )}
        </div>
      )}

      <Modal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        title={editingTemplateId ? "Şablonu Düzenle" : "Yeni Dışa Aktarma Şablonu"}
      >
        <div className="space-y-4">
          <Input
            label="Şablon Adı"
            value={templateForm.name}
            onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Textarea
            label="Açıklama"
            value={templateForm.description}
            onChange={(e) => setTemplateForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
          />
          <Select
            label="Format"
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
            label="Varsayılan Hastane Adı"
            value={templateForm.hospitalName}
            onChange={(e) => setTemplateForm((f) => ({ ...f, hospitalName: e.target.value }))}
          />
          <Input
            label="Başlık Şablonu"
            value={templateForm.titleTemplate}
            onChange={(e) => setTemplateForm((f) => ({ ...f, titleTemplate: e.target.value }))}
          />
          {templateForm.format === "EXCEL" && (
            <>
              <Select
                label="Varsayılan Görünüm"
                value={templateForm.view}
                onChange={(e) =>
                  setTemplateForm((f) => ({ ...f, view: e.target.value as ViewMode }))
                }
              >
                <option value="grid">Tablo</option>
                <option value="person">Kişi</option>
                <option value="location">Lokasyon</option>
              </Select>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Excel Şablon Dosyası (.xlsx)
                </label>
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-600"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Hücrelere {"{{HOSPITAL}}"}, {"{{MONTH}}"}, {"{{YEAR}}"}, {"{{PERIOD}}"} yazın.
                  Nöbet tablosu ayrı sayfalara eklenir.
                </p>
              </div>
            </>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={templateForm.isDefault}
              onChange={(e) => setTemplateForm((f) => ({ ...f, isDefault: e.target.checked }))}
              className="rounded text-blue-600"
            />
            Bu format için varsayılan şablon
          </label>
          {templateError && <p className="text-sm text-red-600">{templateError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setTemplateModalOpen(false)}>
              İptal
            </Button>
            <Button
              variant="primary"
              onClick={saveTemplate}
              disabled={templateSaving || !templateForm.name.trim()}
            >
              {templateSaving ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}