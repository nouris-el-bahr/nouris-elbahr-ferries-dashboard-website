"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  setDownloadDate,
  setVatSuffix,
  setFormat,
  setMode,
  setOnlyCheckedIn,
  setRunning,
  setResult,
  setError,
  clearResult,
} from "@/store/slices/salesSlice";
import PathInput from "@/components/PathInput";
import FolderSelector from "@/components/FolderSelector";
import FileListDisplay from "@/components/FileListDisplay";
import UploadProgress, { FileProgress } from "@/components/UploadProgress";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Download } from "lucide-react";

export default function SalesPage() {
  const dispatch = useAppDispatch();
  const sales = useAppSelector((s) => s.sales);

  // Local state for folder selection and file listing
  const [salesFolderPath, setSalesFolderPath] = useState("");
  const [salesFolderFiles, setSalesFolderFiles] = useState<File[] | undefined>(undefined);
  const [salesFiles, setSalesFiles] = useState<{ name: string; path: string; size: number }[]>([]);
  const [salesFilesLoading, setSalesFilesLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<FileProgress | null>(null);

  // Handle folder selection
  const handleSalesFolderSelect = (path: string, files?: File[]) => {
    setSalesFolderPath(path);
    setSalesFolderFiles(files);
    setSalesFiles([]);
    dispatch(clearResult());
  };

  // List files in the selected folder
  const handleListSalesFiles = async () => {
    if (!salesFolderPath.trim()) {
      dispatch(setError("Veuillez sélectionner le dossier"));
      return;
    }

    setSalesFilesLoading(true);
    try {
      const result = await api.listFolder(salesFolderPath, sales.format, salesFolderFiles);
      setSalesFiles(result.files);
      if (result.files.length === 0) {
        dispatch(setError(`Aucun fichier ${sales.format === "Csv" ? "CSV" : "Excel"} trouvé dans ce dossier`));
      } else {
        dispatch(clearResult());
      }
    } catch (e: unknown) {
      dispatch(setError(e instanceof Error ? e.message : "Erreur inconnue"));
      setSalesFiles([]);
    } finally {
      setSalesFilesLoading(false);
    }
  };

  // Run the sales report
  const handleRun = async () => {
    if (salesFiles.length === 0) {
      dispatch(setError("Veuillez sélectionner des fichiers"));
      return;
    }

    dispatch(setRunning(true));
    dispatch(setError(""));
    dispatch(clearResult());

    try {
      setUploadProgress({ name: "Rapport en cours…", progress: 0 });

      const formData = new FormData();
      formData.append("download_date", sales.downloadDate);
      formData.append("vat_suffix", sales.vatSuffix);
      formData.append("format", sales.format);
      formData.append("mode", sales.mode);
      formData.append("only_checked_in", sales.onlyCheckedIn ? "true" : "false");

      salesFolderFiles?.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch(`${api.baseUrl}/sales/run`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erreur lors de la génération");
      }

      const result = await response.json();
      dispatch(setResult(result.files));
      setUploadProgress(null);

    } catch (error) {
      dispatch(setError(error instanceof Error ? error.message : "Erreur inconnue"));
      setUploadProgress(null);
    } finally {
      dispatch(setRunning(false));
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-nouris-navy">Rapport de ventes</h1>
        <p className="text-gray-500 text-sm mt-1">
          Générez les rapports SalesShort, SalesInvoice et de contrôle
        </p>
      </div>

      {/* Step 1: Folder Selection */}
      <div className="card mb-5">
        <h2 className="font-semibold text-nouris-navy mb-4">Étape 1: Sélectionner le dossier de ventes</h2>

        <FolderSelector
          label="Dossier de ventes"
          hint="Cliquez sur le bouton pour sélectionner le dossier contenant vos fichiers CSV ou Excel"
          onFolderSelect={handleSalesFolderSelect}
        />
      </div>

      {/* Step 2: File Listing */}
      {salesFolderPath && (
        <div className="card mb-5">
          <h2 className="font-semibold text-nouris-navy mb-4">Étape 2: Lister et filtrer les fichiers</h2>

          <div className="mb-4">
            <label className="label text-sm">Format des fichiers</label>
            <div className="flex gap-2">
              <div className="flex-1">
                <select
                  className="input-field text-sm"
                  value={sales.format}
                  onChange={(e) => {
                    dispatch(setFormat(e.target.value));
                    setSalesFiles([]);
                  }}
                  disabled={salesFilesLoading}
                >
                  <option value="Csv">CSV (.csv)</option>
                  <option value="Xlsx">Excel (.xlsx, .xls)</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleListSalesFiles}
                  disabled={salesFilesLoading || !salesFolderPath}
                  className="btn-navy"
                >
                  {salesFilesLoading ? "Chargement…" : "Lister fichiers"}
                </button>
              </div>
            </div>
          </div>

          {/* File list display */}
          <FileListDisplay
            files={salesFiles}
            loading={salesFilesLoading}
            label={`${salesFiles.length} fichier(s) trouvé(s)`}
          />

          {salesFolderPath && salesFiles.length === 0 && !salesFilesLoading && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700 mt-4">
              Aucun fichier {sales.format === "Csv" ? "CSV" : "Excel"} trouvé dans ce dossier.
            </div>
          )}
        </div>
      )}

      {/* Step 3: Configuration and Run */}
      <div className="card mb-5">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center justify-between w-full font-semibold text-nouris-navy mb-4 hover:text-gray-600"
        >
          <span className="flex items-center gap-2">
            Étape 3: Paramètres et génération
          </span>
          {showSettings ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {showSettings && (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="label">Date de téléchargement</label>
                <input
                  type="date"
                  className="input-field"
                  value={sales.downloadDate}
                  onChange={(e) => dispatch(setDownloadDate(e.target.value))}
                />
              </div>
              <div>
                <label className="label">Suffixe TVA</label>
                <input
                  type="text"
                  className="input-field"
                  value={sales.vatSuffix}
                  onChange={(e) => dispatch(setVatSuffix(e.target.value))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <label className="label">Mode du rapport</label>
                <select
                  className="input-field"
                  value={sales.mode}
                  onChange={(e) => dispatch(setMode(e.target.value))}
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
                checked={sales.onlyCheckedIn}
                onChange={(e) => dispatch(setOnlyCheckedIn(e.target.checked))}
              />
              <span className="text-sm text-gray-700">Réservations avec check-in uniquement</span>
            </label>
          </>
        )}
      </div>

      {uploadProgress && (
        <div className="mb-6">
          <UploadProgress files={[uploadProgress]} />
        </div>
      )}

      <button
        onClick={handleRun}
        disabled={sales.running || salesFiles.length === 0}
        className="btn-primary mb-6 w-full py-3 text-base"
      >
        {sales.running ? "Génération en cours…" : "Générer le rapport de ventes"}
      </button>

      {sales.error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-4 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{sales.error}</span>
        </div>
      )}

      {sales.result && (
        <div className="card border-green-100">
          <div className="flex items-center gap-2 text-green-700 font-semibold mb-4">
            <CheckCircle2 size={18} /> Rapport généré avec succès
          </div>
          <div className="space-y-2">
            {sales.result.map((f) => (
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
