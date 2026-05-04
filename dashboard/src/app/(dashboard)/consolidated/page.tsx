"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import FolderSelector from "@/components/FolderSelector";
import FileListDisplay from "@/components/FileListDisplay";
import PathInput from "@/components/PathInput";
import UploadProgress, { FileProgress } from "@/components/UploadProgress";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Download, Zap } from "lucide-react";

interface ResultFile {
  name: string;
  type: string;
}

export default function ConsolidatedPage() {
  // ── Step 1: Reference folder ──────────────────────────────────────────────
  const [refFolderPath, setRefFolderPath]   = useState("");
  const [refFolderFiles, setRefFolderFiles] = useState<File[] | undefined>(undefined);
  const [refFiles, setRefFiles]             = useState<{ name: string; path: string; size: number }[]>([]);
  const [refFilesLoading, setRefFilesLoading] = useState(false);
  const [refFormat, setRefFormat]           = useState<"Csv" | "Xlsx">("Csv");
  const [refDate, setRefDate]               = useState("");

  // ── Step 2: Invoice file & payment dates ──────────────────────────────────
  const [invoiceFile, setInvoiceFile]   = useState<File | null>(null);
  const [factDate, setFactDate]         = useState("");
  const [periodStart, setPeriodStart]   = useState("");
  const [periodEnd, setPeriodEnd]       = useState("");

  // ── Step 3: Sales folder ──────────────────────────────────────────────────
  const [salesFolderPath, setSalesFolderPath]   = useState("");
  const [salesFolderFiles, setSalesFolderFiles] = useState<File[] | undefined>(undefined);
  const [salesFiles, setSalesFiles]             = useState<{ name: string; path: string; size: number }[]>([]);
  const [salesFilesLoading, setSalesFilesLoading] = useState(false);
  const [salesFormat, setSalesFormat]           = useState<"Csv" | "Xlsx">("Csv");
  const [showSalesSettings, setShowSalesSettings] = useState(false);
  const [salesDownloadDate, setSalesDownloadDate] = useState("");
  const [vatSuffix, setVatSuffix]               = useState(". Vat");
  const [salesMode, setSalesMode]               = useState("short");
  const [onlyCheckedIn, setOnlyCheckedIn]       = useState(false);

  // ── Upload & result ───────────────────────────────────────────────────────
  const [running, setRunning]                   = useState(false);
  const [uploadProgress, setUploadProgress]     = useState(0);
  const [fileProgress, setFileProgress]         = useState<FileProgress[]>([]);
  const [result, setResult]                     = useState<ResultFile[] | null>(null);
  const [error, setError]                       = useState("");

  // ── Handlers: list files ──────────────────────────────────────────────────
  const handleListRefFiles = async () => {
    if (!refFolderPath.trim()) { setError("Veuillez sélectionner le dossier de référence"); return; }
    setError("");
    setRefFilesLoading(true);
    try {
      const res = await api.listFolder(refFolderPath, refFormat, refFolderFiles);
      setRefFiles(res.files);
      if (res.files.length === 0)
        setError(`Aucun fichier ${refFormat === "Csv" ? "CSV" : "Excel"} trouvé dans ce dossier`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setRefFiles([]);
    } finally {
      setRefFilesLoading(false);
    }
  };

  const handleListSalesFiles = async () => {
    if (!salesFolderPath.trim()) { setError("Veuillez sélectionner le dossier des ventes"); return; }
    setError("");
    setSalesFilesLoading(true);
    try {
      const res = await api.listFolder(salesFolderPath, salesFormat, salesFolderFiles);
      setSalesFiles(res.files);
      if (res.files.length === 0)
        setError(`Aucun fichier ${salesFormat === "Csv" ? "CSV" : "Excel"} trouvé dans le dossier des ventes`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setSalesFiles([]);
    } finally {
      setSalesFilesLoading(false);
    }
  };

  // ── Run ───────────────────────────────────────────────────────────────────
  const canRun =
    refFiles.length > 0 && !!invoiceFile && salesFiles.length > 0 &&
    refDate && factDate && periodStart && periodEnd;

  const handleRun = () => {
    if (!canRun) { setError("Veuillez compléter toutes les étapes avant de générer."); return; }
    setError("");
    setResult(null);
    setRunning(true);

    const refExt   = refFormat   === "Csv" ? [".csv"] : [".xlsx", ".xls"];
    const salesExt = salesFormat === "Csv" ? [".csv"] : [".xlsx", ".xls"];
    const refToUpload   = (refFolderFiles   ?? []).filter(f => refExt.includes(f.name.substring(f.name.lastIndexOf(".")).toLowerCase()));
    const salesToUpload = (salesFolderFiles ?? []).filter(f => salesExt.includes(f.name.substring(f.name.lastIndexOf(".")).toLowerCase()));

    const allFiles = [...refToUpload, ...salesToUpload, invoiceFile!];
    setFileProgress(allFiles.map(f => ({ name: f.name, size: f.size, progress: 0, status: "pending" as const })));
    setUploadProgress(0);

    const fd = new FormData();
    refToUpload.forEach(f   => fd.append("ref_files",   f));
    salesToUpload.forEach(f => fd.append("sales_files", f));
    fd.append("invoice_file",      invoiceFile!);
    fd.append("ref_date",          refDate);
    fd.append("fact_date",         factDate);
    fd.append("period_start",      periodStart);
    fd.append("period_end",        periodEnd);
    fd.append("ref_format",        refFormat);
    fd.append("sales_format",      salesFormat);
    fd.append("sales_download_date", salesDownloadDate || factDate);
    fd.append("vat_suffix",        vatSuffix);
    fd.append("mode",              salesMode);
    fd.append("only_checked_in",   onlyCheckedIn ? "true" : "false");

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && allFiles.length > 0) {
        const totalPct = (e.loaded / e.total) * 100;
        setUploadProgress(totalPct);
        const perFile = 100 / allFiles.length;
        const fileIdx = Math.floor(totalPct / perFile);
        setFileProgress(prev => prev.map((fp, idx) => ({
          ...fp,
          progress: idx < fileIdx ? 100 : idx === fileIdx ? (totalPct % perFile) * allFiles.length : 0,
          status:   idx < fileIdx ? "done" : idx === fileIdx ? "uploading" : "pending",
        })));
      }
    });

    xhr.addEventListener("load", () => {
      setRunning(false);
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.error) {
            setError(data.error);
            setFileProgress(prev => prev.map(fp => ({ ...fp, status: "error" as const, error: data.error })));
          } else {
            setResult(data.files ?? []);
            setFileProgress(prev => prev.map(fp => ({ ...fp, progress: 100, status: "done" as const })));
            setUploadProgress(100);
          }
        } catch { setError("Réponse invalide du serveur."); }
      } else {
        try { setError(JSON.parse(xhr.responseText).error ?? `Erreur ${xhr.status}`); }
        catch { setError(`Erreur ${xhr.status}`); }
        setFileProgress(prev => prev.map(fp => ({ ...fp, status: "error" as const })));
      }
    });

    xhr.addEventListener("error", () => { setRunning(false); setError("Erreur réseau lors du téléchargement."); });
    xhr.addEventListener("abort", () => { setRunning(false); setError("Téléchargement annulé."); });

    xhr.open("POST", `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000"}/api/consolidated/run`);
    xhr.send(fd);
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-50 rounded-lg">
            <Zap size={24} className="text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-nouris-navy">Facture Consolidée</h1>
            <p className="text-gray-500 text-sm mt-1">
              Combinez les données de paiement et de ventes en un seul rapport
            </p>
          </div>
        </div>
      </div>

      {/* ── Step 1: Reference snapshot folder ────────────────────────────────── */}
      <div className="card mb-5">
        <h2 className="font-semibold text-nouris-navy mb-4 flex items-center gap-2">
          <span className="step-badge">1</span>
          Snapshot de référence
        </h2>

        {/* 1a — Select folder */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-3">Étape 1: Sélectionner le dossier</h3>
          <FolderSelector
            label="Dossier de référence"
            hint="Cliquez sur le bouton pour sélectionner le dossier contenant vos fichiers CSV ou Excel"
            onFolderSelect={(path, files) => {
              setRefFolderPath(path);
              setRefFolderFiles(files);
              setRefFiles([]);
            }}
            disabled={running}
          />
        </div>

        {/* 1b — List files */}
        {refFolderPath && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-4 mb-4">
            <h3 className="text-sm font-semibold text-green-900">Étape 2: Lister les fichiers</h3>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="label text-xs text-green-800">Format des fichiers</label>
                <select
                  className="input-field text-sm"
                  value={refFormat}
                  onChange={(e) => { setRefFormat(e.target.value as "Csv" | "Xlsx"); setRefFiles([]); }}
                  disabled={refFilesLoading || running}
                >
                  <option value="Csv">CSV (.csv)</option>
                  <option value="Xlsx">Excel (.xlsx, .xls)</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleListRefFiles}
                  disabled={refFilesLoading || running}
                  className="btn-navy"
                >
                  {refFilesLoading ? "Chargement…" : "Lister fichiers"}
                </button>
              </div>
            </div>

            <FileListDisplay
              files={refFiles}
              loading={refFilesLoading}
              label={`${refFiles.length} fichier(s) trouvé(s)`}
            />

            {refFiles.length === 0 && !refFilesLoading && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
                Aucun fichier {refFormat === "Csv" ? "CSV" : "Excel"} trouvé dans ce dossier.
              </div>
            )}
          </div>
        )}

        {/* Date de la référence */}
        <div>
          <label className="label">Date de la référence</label>
          <input
            type="date"
            className="input-field"
            value={refDate}
            onChange={(e) => setRefDate(e.target.value)}
            disabled={running}
          />
        </div>
      </div>

      {/* ── Step 2: Invoice file & payment dates ─────────────────────────────── */}
      <div className="card mb-5">
        <h2 className="font-semibold text-nouris-navy mb-4 flex items-center gap-2">
          <span className="step-badge">2</span>
          Fichier de facture &amp; dates
        </h2>

        <div className="mb-5">
          <PathInput
            label="Fichier de facture (CSV ou Excel)"
            mode="file"
            accept=".csv,.xlsx,.xls"
            selected={invoiceFile?.name ?? ""}
            onSelect={(files) => setInvoiceFile(files[0] ?? null)}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Date de téléchargement</label>
            <input
              type="date"
              className="input-field"
              value={factDate}
              onChange={(e) => setFactDate(e.target.value)}
              disabled={running}
            />
          </div>
          <div>
            <label className="label">Début de période</label>
            <input
              type="date"
              className="input-field"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              disabled={running}
            />
          </div>
          <div>
            <label className="label">Fin de période</label>
            <input
              type="date"
              className="input-field"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              disabled={running}
            />
          </div>
        </div>
      </div>

      {/* ── Step 3: Sales folder ──────────────────────────────────────────────── */}
      <div className="card mb-5">
        <h2 className="font-semibold text-nouris-navy mb-4 flex items-center gap-2">
          <span className="step-badge">3</span>
          Dossier des ventes
        </h2>

        {/* Folder selector */}
        <div className="mb-4">
          <FolderSelector
            label="Dossier de ventes"
            hint="Cliquez sur le bouton pour sélectionner le dossier contenant vos fichiers CSV ou Excel"
            onFolderSelect={(path, files) => {
              setSalesFolderPath(path);
              setSalesFolderFiles(files);
              setSalesFiles([]);
            }}
            disabled={running}
          />
        </div>

        {/* List sales files */}
        {salesFolderPath && (
          <div className="mb-4">
            <label className="label text-sm">Format des fichiers</label>
            <div className="flex gap-2 mb-4">
              <div className="flex-1">
                <select
                  className="input-field text-sm"
                  value={salesFormat}
                  onChange={(e) => { setSalesFormat(e.target.value as "Csv" | "Xlsx"); setSalesFiles([]); }}
                  disabled={salesFilesLoading || running}
                >
                  <option value="Csv">CSV (.csv)</option>
                  <option value="Xlsx">Excel (.xlsx, .xls)</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleListSalesFiles}
                  disabled={salesFilesLoading || !salesFolderPath || running}
                  className="btn-navy"
                >
                  {salesFilesLoading ? "Chargement…" : "Lister fichiers"}
                </button>
              </div>
            </div>

            <FileListDisplay
              files={salesFiles}
              loading={salesFilesLoading}
              label={`${salesFiles.length} fichier(s) trouvé(s)`}
            />

            {salesFiles.length === 0 && !salesFilesLoading && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700 mt-4">
                Aucun fichier {salesFormat === "Csv" ? "CSV" : "Excel"} trouvé dans ce dossier.
              </div>
            )}
          </div>
        )}

        {/* Sales settings (collapsible) */}
        <div className="border-t border-gray-100 pt-4">
          <button
            onClick={() => setShowSalesSettings(!showSalesSettings)}
            className="flex items-center justify-between w-full font-semibold text-nouris-navy mb-4 hover:text-gray-600"
          >
            <span className="flex items-center gap-2">
              Paramètres et génération des ventes
            </span>
            {showSalesSettings ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {showSalesSettings && (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="label">Date de téléchargement (ventes)</label>
                  <input
                    type="date"
                    className="input-field"
                    value={salesDownloadDate}
                    onChange={(e) => setSalesDownloadDate(e.target.value)}
                    disabled={running}
                  />
                </div>
                <div>
                  <label className="label">Suffixe TVA</label>
                  <input
                    type="text"
                    className="input-field"
                    value={vatSuffix}
                    onChange={(e) => setVatSuffix(e.target.value)}
                    disabled={running}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="label">Mode du rapport</label>
                  <select
                    className="input-field"
                    value={salesMode}
                    onChange={(e) => setSalesMode(e.target.value)}
                    disabled={running}
                  >
                    <option value="short">Court</option>
                    <option value="detailed">Détaillé</option>
                  </select>
                </div>
                <div></div>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-nouris rounded"
                  checked={onlyCheckedIn}
                  onChange={(e) => setOnlyCheckedIn(e.target.checked)}
                  disabled={running}
                />
                <span className="text-sm text-gray-700">Réservations avec check-in uniquement</span>
              </label>
            </>
          )}
        </div>
      </div>

      {/* Upload progress */}
      {running && fileProgress.length > 0 && (
        <div className="card mb-5">
          <UploadProgress
            files={fileProgress}
            totalProgress={uploadProgress}
            isComplete={uploadProgress === 100}
          />
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={handleRun}
        disabled={running || !canRun}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-150 flex items-center justify-center gap-2 mb-6"
      >
        {running ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Génération en cours…
          </>
        ) : (
          <>
            <Zap size={18} />
            Générer Facture Consolidée
          </>
        )}
      </button>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-4 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Result */}
      {result && result.length > 0 && (
        <div className="card border-green-100">
          <div className="flex items-center gap-2 text-green-700 font-semibold mb-4">
            <CheckCircle2 size={18} /> Rapport généré avec succès
          </div>
          <div className="space-y-2">
            {result.map((f) => (
              <a
                key={f.name}
                href={api.getDownloadUrl(f.name, f.type)}
                download={f.name}
                className="flex items-center gap-2 text-sm text-nouris hover:text-nouris-d transition-colors"
              >
                <Download size={14} /> {f.name}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
