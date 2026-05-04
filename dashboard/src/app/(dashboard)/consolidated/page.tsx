"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import FolderSelector from "@/components/FolderSelector";
import UploadProgress, { FileProgress } from "@/components/UploadProgress";
import { AlertCircle, CheckCircle2, Download, Zap } from "lucide-react";

interface ResultFile {
  name: string;
  type: string;
}

export default function ConsolidatedPage() {
  const [refFolderFiles, setRefFolderFiles] = useState<File[] | undefined>(undefined);
  const [refFolderPath, setRefFolderPath] = useState("");
  const [refFormat, setRefFormat] = useState<"Csv" | "Xlsx">("Csv");

  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);

  const [salesFolderFiles, setSalesFolderFiles] = useState<File[] | undefined>(undefined);
  const [salesFolderPath, setSalesFolderPath] = useState("");
  const [salesFormat, setSalesFormat] = useState<"Csv" | "Xlsx">("Csv");

  const [factDate, setFactDate] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  const [running, setRunning] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileProgress, setFileProgress] = useState<FileProgress[]>([]);
  const [result, setResult] = useState<ResultFile[] | null>(null);
  const [error, setError] = useState("");

  const canRun =
    refFolderFiles && refFolderFiles.length > 0 &&
    invoiceFile &&
    salesFolderFiles && salesFolderFiles.length > 0 &&
    factDate && periodStart && periodEnd;

  const handleRun = () => {
    if (!canRun) {
      setError("Veuillez remplir tous les champs requis.");
      return;
    }
    setError("");
    setResult(null);
    setRunning(true);

    const refExtensions   = refFormat   === "Csv" ? [".csv"] : [".xlsx", ".xls"];
    const salesExtensions = salesFormat === "Csv" ? [".csv"] : [".xlsx", ".xls"];

    const refFilesToUpload = (refFolderFiles ?? []).filter((f) =>
      refExtensions.includes(f.name.substring(f.name.lastIndexOf(".")).toLowerCase())
    );
    const salesFilesToUpload = (salesFolderFiles ?? []).filter((f) =>
      salesExtensions.includes(f.name.substring(f.name.lastIndexOf(".")).toLowerCase())
    );

    if (refFilesToUpload.length === 0) {
      setError(`Aucun fichier ${refFormat === "Csv" ? "CSV" : "Excel"} dans le dossier de référence.`);
      setRunning(false);
      return;
    }
    if (salesFilesToUpload.length === 0) {
      setError(`Aucun fichier ${salesFormat === "Csv" ? "CSV" : "Excel"} dans le dossier des ventes.`);
      setRunning(false);
      return;
    }

    const allFiles = [...refFilesToUpload, ...salesFilesToUpload, invoiceFile!];
    setFileProgress(allFiles.map((f) => ({ name: f.name, size: f.size, progress: 0, status: "pending" })));

    const fd = new FormData();
    refFilesToUpload.forEach((f) => fd.append("ref_files", f));
    salesFilesToUpload.forEach((f) => fd.append("sales_files", f));
    fd.append("invoice_file", invoiceFile!);
    fd.append("fact_date", factDate);
    fd.append("period_start", periodStart);
    fd.append("period_end", periodEnd);
    fd.append("ref_format", refFormat);
    fd.append("sales_format", salesFormat);
    fd.append("download_date", factDate);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const pct = (e.loaded / e.total) * 100;
        setUploadProgress(pct);
        setFileProgress((prev) =>
          prev.map((fp, idx) => ({
            ...fp,
            progress: idx < Math.floor((pct / 100) * prev.length) ? 100 : idx === Math.floor((pct / 100) * prev.length) ? pct % (100 / prev.length) * prev.length : 0,
            status:   idx < Math.floor((pct / 100) * prev.length) ? "done" : idx === Math.floor((pct / 100) * prev.length) ? "uploading" : "pending",
          }))
        );
      }
    });

    xhr.addEventListener("load", () => {
      setRunning(false);
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.error) {
            setError(data.error);
            setFileProgress((prev) => prev.map((fp) => ({ ...fp, status: "error" as const, error: data.error })));
          } else {
            setResult(data.files ?? []);
            setFileProgress((prev) => prev.map((fp) => ({ ...fp, progress: 100, status: "done" as const })));
            setUploadProgress(100);
          }
        } catch {
          setError("Réponse invalide du serveur.");
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          setError(data.error ?? `Erreur ${xhr.status}`);
        } catch {
          setError(`Erreur ${xhr.status}`);
        }
        setFileProgress((prev) => prev.map((fp) => ({ ...fp, status: "error" as const })));
      }
    });

    xhr.addEventListener("error", () => {
      setRunning(false);
      setError("Erreur réseau lors du téléchargement.");
      setFileProgress((prev) => prev.map((fp) => ({ ...fp, status: "error" as const })));
    });

    xhr.addEventListener("abort", () => {
      setRunning(false);
      setError("Téléchargement annulé.");
    });

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

      {/* Step 1 — Reference folder */}
      <div className="card mb-5">
        <h2 className="font-semibold text-nouris-navy mb-4 flex items-center gap-2">
          <span className="step-badge">1</span>
          Dossier de référence (paiement)
        </h2>
        <FolderSelector
          label="Dossier de référence"
          hint="Sélectionnez le dossier contenant les fichiers de référence CSV ou Excel"
          onFolderSelect={(path, files) => {
            setRefFolderPath(path);
            setRefFolderFiles(files);
          }}
          disabled={running}
        />
        {refFolderPath && (
          <div className="mt-3">
            <label className="label text-xs">Format des fichiers</label>
            <select
              className="input-field text-sm"
              value={refFormat}
              onChange={(e) => setRefFormat(e.target.value as "Csv" | "Xlsx")}
              disabled={running}
            >
              <option value="Csv">CSV (.csv)</option>
              <option value="Xlsx">Excel (.xlsx, .xls)</option>
            </select>
          </div>
        )}
        {refFolderFiles && (
          <p className="text-xs text-gray-500 mt-2">
            {refFolderFiles.length} fichier(s) chargé(s) depuis &laquo;{refFolderPath}&raquo;
          </p>
        )}
      </div>

      {/* Step 2 — Invoice file */}
      <div className="card mb-5">
        <h2 className="font-semibold text-nouris-navy mb-4 flex items-center gap-2">
          <span className="step-badge">2</span>
          Fichier de facture (CSV ou Excel)
        </h2>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          disabled={running}
          onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-nouris file:text-white hover:file:bg-nouris-d"
        />
        {invoiceFile && (
          <p className="text-sm text-green-600 mt-2">✓ {invoiceFile.name}</p>
        )}
      </div>

      {/* Step 3 — Sales folder */}
      <div className="card mb-5">
        <h2 className="font-semibold text-nouris-navy mb-4 flex items-center gap-2">
          <span className="step-badge">3</span>
          Dossier des ventes (brut)
        </h2>
        <FolderSelector
          label="Dossier des ventes"
          hint="Sélectionnez le dossier contenant les fichiers de ventes CSV ou Excel"
          onFolderSelect={(path, files) => {
            setSalesFolderPath(path);
            setSalesFolderFiles(files);
          }}
          disabled={running}
        />
        {salesFolderPath && (
          <div className="mt-3">
            <label className="label text-xs">Format des fichiers</label>
            <select
              className="input-field text-sm"
              value={salesFormat}
              onChange={(e) => setSalesFormat(e.target.value as "Csv" | "Xlsx")}
              disabled={running}
            >
              <option value="Csv">CSV (.csv)</option>
              <option value="Xlsx">Excel (.xlsx, .xls)</option>
            </select>
          </div>
        )}
        {salesFolderFiles && (
          <p className="text-xs text-gray-500 mt-2">
            {salesFolderFiles.length} fichier(s) chargé(s) depuis &laquo;{salesFolderPath}&raquo;
          </p>
        )}
      </div>

      {/* Step 4 — Dates */}
      <div className="card mb-5">
        <h2 className="font-semibold text-nouris-navy mb-4 flex items-center gap-2">
          <span className="step-badge">4</span>
          Paramètres de période
        </h2>
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

      {/* Run button */}
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
            <CheckCircle2 size={18} /> Facture consolidée générée avec succès
          </div>
          <div className="space-y-2">
            {result.map((f) => (
              <a
                key={f.name}
                href={api.getDownloadUrl(f.name, f.type)}
                download={f.name}
                className="flex items-center gap-2 text-sm text-purple-600 hover:text-purple-800 transition-colors"
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
