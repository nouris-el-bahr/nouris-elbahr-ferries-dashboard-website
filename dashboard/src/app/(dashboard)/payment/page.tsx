"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  fetchSnapshots,
  setSelected,
  addSnapshot,
  setArchiving,
  setError as setSnapError,
  clearError as clearSnapError,
} from "@/store/slices/snapshotsSlice";
import {
  setFactDate,
  setPeriodStart,
  setPeriodEnd,
  setRunning,
  setResult,
  setError as setPayError,
  clearResult,
} from "@/store/slices/paymentSlice";
import PathInput from "@/components/PathInput";
import FolderSelector from "@/components/FolderSelector";
import FileListDisplay from "@/components/FileListDisplay";
import UploadProgress, { FileProgress } from "@/components/UploadProgress";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
} from "lucide-react";

export default function PaymentPage() {
  const dispatch = useAppDispatch();
  const snaps = useAppSelector((s) => s.snapshots);
  const pay = useAppSelector((s) => s.payment);

  // Non-serializable / local-only state
  const [showNewSnap, setShowNewSnap] = useState(false);
  const [refFolderPath, setRefFolderPath] = useState("");
  const [refFolderFiles, setRefFolderFiles] = useState<File[] | undefined>(undefined);
  const [refFiles, setRefFiles] = useState<{ name: string; path: string; size: number }[]>([]);
  const [refFilesLoading, setRefFilesLoading] = useState(false);
  const [refDate, setRefDate] = useState("");
  const [refFormat, setRefFormat] = useState<"Csv" | "Xlsx">("Csv");
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);

  // Upload progress state
  const [uploadingRef, setUploadingRef] = useState(false);
  const [fileProgress, setFileProgress] = useState<FileProgress[]>([]);
  const [refUploadProgress, setRefUploadProgress] = useState(0);


  useEffect(() => {
    dispatch(fetchSnapshots());
  }, [dispatch]);

  // List files in the selected folder
  const handleListRefFiles = async () => {
    if (!refFolderPath.trim()) {
      dispatch(setSnapError("Veuillez sélectionner le dossier"));
      return;
    }
    dispatch(clearSnapError());
    setRefFilesLoading(true);
    console.log("[handleListRefFiles] Calling api.listFolder with:", {
      refFolderPath,
      refFormat,
      refFolderFilesCount: refFolderFiles?.length ?? 0,
    });
    try {
      const result = await api.listFolder(refFolderPath, refFormat, refFolderFiles);
      console.log("[handleListRefFiles] Result:", result);
      setRefFiles(result.files);
      if (result.files.length === 0) {
        dispatch(setSnapError(`Aucun fichier ${refFormat === "Csv" ? "CSV" : "Excel"} trouvé dans ce dossier`));
      }
    } catch (e: unknown) {
      dispatch(setSnapError(e instanceof Error ? e.message : "Erreur inconnue"));
      setRefFiles([]);
    } finally {
      setRefFilesLoading(false);
    }
  };

  // Archive the snapshot using folder path
  const archiveSnapshotFromFolder = async (): Promise<string> => {
    if (!refFolderPath.trim()) {
      throw new Error("Chemin du dossier requis");
    }
    if (!refDate) {
      throw new Error("Date de la référence requise");
    }

    const initialProgress: FileProgress[] = refFiles.map((f) => ({
      name: f.name,
      size: f.size,
      progress: 0,
      status: "pending",
    }));
    setFileProgress(initialProgress);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      const payload = JSON.stringify({
        folder_path: refFolderPath,
        ref_date: refDate,
        format: refFormat,
      });

      // Simulate progress for each file
      let currentFile = 0;
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && refFiles.length > 0) {
          const totalPercent = (e.loaded / e.total) * 100;
          setRefUploadProgress(totalPercent);

          // Update progress for each file
          const fileIndex = Math.floor((totalPercent / 100) * refFiles.length);
          setFileProgress((prev) =>
            prev.map((fp, idx) => ({
              ...fp,
              progress: idx < fileIndex ? 100 : idx === fileIndex ? totalPercent % (100 / refFiles.length) * refFiles.length : 0,
              status: idx < fileIndex ? "done" : idx === fileIndex ? "uploading" : "pending",
            }))
          );
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          if (response.error) {
            reject(new Error(response.error));
          } else {
            setFileProgress((prev) =>
              prev.map((fp) => ({ ...fp, progress: 100, status: "done" as const }))
            );
            setRefUploadProgress(100);
            resolve(response.name);
          }
        } else {
          const errorData = JSON.parse(xhr.responseText);
          reject(new Error(errorData.error ?? "Erreur de téléchargement"));
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("Erreur réseau lors du téléchargement"));
      });

      xhr.addEventListener("abort", () => {
        reject(new Error("Téléchargement annulé"));
      });

      xhr.open("POST", `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000"}/api/snapshots/upload`);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(payload);
    });
  };

  const handleArchiveRef = async () => {
    if (!refFiles || refFiles.length === 0) {
      dispatch(setSnapError("Veuillez d'abord lister les fichiers du dossier."));
      return;
    }
    if (!refDate) {
      dispatch(setSnapError("Date de la référence requise."));
      return;
    }
    dispatch(clearSnapError());
    dispatch(setArchiving(true));
    setUploadingRef(true);
    try {
      const snapName = await archiveSnapshotFromFolder();
      const snap = { name: snapName, filename: `${snapName}.csv` };
      dispatch(addSnapshot(snap));
      setShowNewSnap(false);
      setRefFolderPath("");
      setRefFolderFiles(undefined);
      setRefFiles([]);
      setFileProgress([]);
      setRefDate("");
      setFileProgress([]);
      setRefUploadProgress(0);
    } catch (e: unknown) {
      dispatch(setSnapError(e instanceof Error ? e.message : "Erreur inconnue"));
      setFileProgress((prev) =>
        prev.map((fp) => ({
          ...fp,
          status: "error" as const,
          error: "Erreur lors du téléchargement",
        }))
      );
    } finally {
      dispatch(setArchiving(false));
      setUploadingRef(false);
    }
  };

  const handleRun = async () => {
    if (!snaps.selected) {
      dispatch(setPayError("Veuillez sélectionner un snapshot de référence."));
      return;
    }
    if (!invoiceFile) {
      dispatch(setPayError("Veuillez sélectionner le fichier de facture."));
      return;
    }
    if (!pay.factDate || !pay.periodStart || !pay.periodEnd) {
      dispatch(setPayError("Veuillez renseigner toutes les dates."));
      return;
    }
    dispatch(clearResult());
    dispatch(setRunning(true));
    try {
      const res = await api.runPayment({
        snapshotName: snaps.selected,
        invoiceFile,
        factDate: pay.factDate,
        periodStart: pay.periodStart,
        periodEnd: pay.periodEnd,
      });
      if (res.error) dispatch(setPayError(res.error));
      else dispatch(setResult(res.files ?? []));
    } catch (e: unknown) {
      dispatch(setPayError(e instanceof Error ? e.message : "Erreur inconnue"));
    } finally {
      dispatch(setRunning(false));
    }
  };

  const error = snaps.error || pay.error;

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-nouris-navy">Rapport de paiement</h1>
        <p className="text-gray-500 text-sm mt-1">Générez la facture et le rapport de paiement groupé</p>
      </div>

      {/* Step 1 */}
      <div className="card mb-5">
        <h2 className="font-semibold text-nouris-navy mb-4 flex items-center gap-2">
          <span className="step-badge">1</span>
          Snapshot de référence
        </h2>

        {snaps.loading ? (
          <p className="text-sm text-gray-400">Chargement…</p>
        ) : (
          <select
            className="input-field mb-3"
            value={snaps.selected}
            onChange={(e) => dispatch(setSelected(e.target.value))}
          >
            {snaps.list.length === 0 && (
              <option value="">Aucun snapshot archivé — créez-en un ci-dessous</option>
            )}
            {snaps.list.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={() => setShowNewSnap((v) => !v)}
          className="flex items-center gap-1.5 text-sm text-nouris hover:text-nouris-d transition-colors"
        >
          {showNewSnap ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {showNewSnap ? "Masquer" : "Archiver un nouveau snapshot depuis un dossier"}
        </button>

        {showNewSnap && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
            {/* Step 1: Select Folder */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-3">Étape 1: Sélectionner le dossier</h3>
              <FolderSelector
                label="Dossier de référence"
                hint="Cliquez sur le bouton pour sélectionner le dossier contenant vos fichiers CSV ou Excel"
                onFolderSelect={(path, files) => {
                  console.log("[PaymentPage] Folder selected:", { path, filesCount: files?.length ?? 0 });
                  setRefFolderPath(path);
                  setRefFolderFiles(files);
                }}
                disabled={refFilesLoading || uploadingRef}
              />
            </div>

            {/* Step 2: List Files */}
            {refFolderPath && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-green-900 mb-3">Étape 2: Lister les fichiers</h3>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="label text-xs text-green-800">Format des fichiers</label>
                      <select
                        className="input-field text-sm"
                        value={refFormat}
                        onChange={(e) => {
                          setRefFormat(e.target.value as "Csv" | "Xlsx");
                          setRefFiles([]);
                        }}
                        disabled={refFilesLoading || uploadingRef}
                      >
                        <option value="Csv">CSV (.csv)</option>
                        <option value="Xlsx">Excel (.xlsx, .xls)</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={handleListRefFiles}
                        disabled={refFilesLoading || uploadingRef}
                        className="btn-navy"
                      >
                        {refFilesLoading ? "Chargement…" : "Lister fichiers"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* File list display */}
                <FileListDisplay
                  files={refFiles}
                  loading={refFilesLoading}
                  label={`${refFiles.length} fichier(s) trouvé(s)`}
                />
              </div>
            )}

            {/* Step 3: Upload progress */}
            {uploadingRef && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-purple-900 mb-3">Étape 3: Archivage en cours</h3>
                <UploadProgress
                  files={fileProgress}
                  totalProgress={refUploadProgress}
                  isComplete={refUploadProgress === 100}
                />
              </div>
            )}

            {/* Date field - always visible when form is open */}
            <div>
              <label className="label">Date de la référence</label>
              <input
                type="date"
                className="input-field"
                value={refDate}
                onChange={(e) => setRefDate(e.target.value)}
                disabled={uploadingRef}
              />
            </div>

            {/* Archive button - only enabled when files are listed */}
            {refFiles.length > 0 && !uploadingRef && (
              <button
                onClick={handleArchiveRef}
                disabled={snaps.archiving || !refDate}
                className="btn-primary w-full"
              >
                Archiver le snapshot
              </button>
            )}

            {/* Show message if files are selected but empty after listing */}
            {refFolderPath && refFiles.length === 0 && !refFilesLoading && !uploadingRef && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
                Aucun fichier {refFormat === "Csv" ? "CSV" : "Excel"} trouvé dans ce dossier.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 2 */}
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
              value={pay.factDate}
              onChange={(e) => dispatch(setFactDate(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Début de période</label>
            <input
              type="date"
              className="input-field"
              value={pay.periodStart}
              onChange={(e) => dispatch(setPeriodStart(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Fin de période</label>
            <input
              type="date"
              className="input-field"
              value={pay.periodEnd}
              onChange={(e) => dispatch(setPeriodEnd(e.target.value))}
            />
          </div>
        </div>
      </div>

      <button onClick={handleRun} disabled={pay.running} className="btn-primary mb-6 w-full py-3 text-base">
        {pay.running ? "Génération en cours…" : "Générer le rapport de paiement"}
      </button>

      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-4 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {pay.result && (
        <div className="card border-green-100">
          <div className="flex items-center gap-2 text-green-700 font-semibold mb-4">
            <CheckCircle2 size={18} /> Rapport généré avec succès
          </div>
          <div className="space-y-2">
            {pay.result.map((f) => (
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
