"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  setFactDate,
  setPeriodStart,
  setPeriodEnd,
  setRunning,
  setResult,
  setError as setPayError,
  clearResult,
} from "@/store/slices/paymentSlice";
import {
  fetchSnapshots,
  setSelected,
} from "@/store/slices/snapshotsSlice";
import PathInput from "@/components/PathInput";
import FileListDisplay from "@/components/FileListDisplay";
import UploadProgress, { FileProgress } from "@/components/UploadProgress";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Zap,
} from "lucide-react";

export default function ConsolidatedPage() {
  const dispatch = useAppDispatch();
  const snaps = useAppSelector((s) => s.snapshots);
  const pay = useAppSelector((s) => s.payment);

  const [showInputs, setShowInputs] = useState(false);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<FileProgress | null>(null);

  useEffect(() => {
    dispatch(fetchSnapshots());
  }, [dispatch]);

  const handleRunConsolidated = async () => {
    if (!snaps.selected || !invoiceFile || !pay.factDate || !pay.periodStart || !pay.periodEnd) {
      dispatch(setPayError("Veuillez remplir tous les champs requis"));
      return;
    }

    dispatch(setRunning(true));
    dispatch(setPayError(null));
    dispatch(clearResult());

    try {
      setUploadProgress({ name: "Consolidation en cours...", progress: 0 });

      const formData = new FormData();
      formData.append("snapshot_name", snaps.selected.stem);
      formData.append("invoice_file", invoiceFile);
      formData.append("fact_date", pay.factDate);
      formData.append("period_start", pay.periodStart);
      formData.append("period_end", pay.periodEnd);

      if (salesFile) {
        formData.append("sales_file", salesFile);
      }

      const response = await fetch(`${api.baseUrl}/consolidated/run`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const result = await response.json();
      dispatch(setResult(result));
      setUploadProgress(null);

    } catch (error) {
      dispatch(setPayError(`Erreur: ${error instanceof Error ? error.message : String(error)}`));
      setUploadProgress(null);
    } finally {
      dispatch(setRunning(false));
    }
  };

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
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
      </div>

      {/* Info Card */}
      <div className="card border-l-4 border-l-purple-500 mb-6 bg-purple-50/30">
        <div className="flex gap-3">
          <div className="text-purple-600 pt-0.5">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zm-11-1a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 text-sm">Qu'est-ce qu'une facture consolidée ?</h3>
            <p className="text-gray-600 text-sm mt-1">
              Ce rapport combine les montants de paiement (par point de vente et devise) avec les commissions et soldes des ventes.
              Il montre toutes les réservations des deux systèmes (paiement et ventes) en un seul fichier Excel.
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="card">
        {/* Reference Snapshot Section */}
        <div className="border-b border-gray-100 pb-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">1. Snapshot de Référence</h3>
            <span className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-full font-medium">
              Requis
            </span>
          </div>
          <FileListDisplay files={snaps.list} selected={snaps.selected} onSelect={(f) => dispatch(setSelected(f))} />
        </div>

        {/* Invoice Section */}
        <div className="border-b border-gray-100 pb-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">2. Fichier de Facturation</h3>
            <span className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-full font-medium">
              Requis
            </span>
          </div>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-nouris file:text-white hover:file:bg-nouris-d"
          />
          {invoiceFile && <p className="text-sm text-green-600 mt-2">✓ {invoiceFile.name}</p>}
        </div>

        {/* Sales File Section (Optional) */}
        <div className="border-b border-gray-100 pb-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">3. Fichier Ventes (Optionnel)</h3>
            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full font-medium">
              Optionnel
            </span>
          </div>
          <p className="text-sm text-gray-500 mb-3">Laissez vide pour auto-détecter le dernier fichier SalesInvoice.xlsx</p>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setSalesFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
          />
          {salesFile && <p className="text-sm text-green-600 mt-2">✓ {salesFile.name}</p>}
        </div>

        {/* Date Section */}
        <div className="border-b border-gray-100 pb-6 mb-6">
          <button
            onClick={() => setShowInputs(!showInputs)}
            className="flex items-center justify-between w-full text-left font-semibold text-gray-800 mb-4 hover:text-gray-600"
          >
            <span className="flex items-center gap-2">
              <span>4. Paramètres de Période</span>
              <span className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-full font-medium">
                Requis
              </span>
            </span>
            {showInputs ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {showInputs && (
            <div className="space-y-4">
              <PathInput
                label="Date de Téléchargement (YYYY-MM-DD)"
                value={pay.factDate}
                onChange={(v) => dispatch(setFactDate(v))}
                placeholder="2026-04-30"
              />
              <PathInput
                label="Date de Début (YYYY-MM-DD)"
                value={pay.periodStart}
                onChange={(v) => dispatch(setPeriodStart(v))}
                placeholder="2026-04-01"
              />
              <PathInput
                label="Date de Fin (YYYY-MM-DD)"
                value={pay.periodEnd}
                onChange={(v) => dispatch(setPeriodEnd(v))}
                placeholder="2026-04-16"
              />
            </div>
          )}
        </div>

        {/* Error Display */}
        {pay.error && (
          <div className="mb-6 flex gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
            <p className="text-sm text-red-700">{pay.error}</p>
          </div>
        )}

        {/* Progress */}
        {uploadProgress && (
          <div className="mb-6">
            <UploadProgress files={[uploadProgress]} />
          </div>
        )}

        {/* Result */}
        {pay.result && (
          <div className="mb-6 flex gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle2 className="text-green-600 flex-shrink-0" size={20} />
            <div className="text-sm text-green-700">
              <p className="font-medium">Facture consolidée générée avec succès !</p>
              <p className="mt-1 text-xs text-green-600">Fichier: {pay.result.consolidated_file}</p>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={handleRunConsolidated}
          disabled={pay.running || !snaps.selected || !invoiceFile || !pay.factDate || !pay.periodStart || !pay.periodEnd}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-150 flex items-center justify-center gap-2"
        >
          {pay.running ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Génération en cours...
            </>
          ) : (
            <>
              <Zap size={18} />
              Générer Facture Consolidée
            </>
          )}
        </button>

        {/* Info Text */}
        <p className="text-xs text-gray-400 mt-4 text-center">
          Les fichiers seront sauvegardés dans Data/Result/Payment/ et archivés appropriément.
        </p>
      </div>

      {/* Features Card */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-purple-600 mb-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h4 className="font-semibold text-sm text-gray-800">Montants de Paiement</h4>
          <p className="text-xs text-gray-500 mt-1">Par point de vente et devise</p>
        </div>

        <div className="card p-4">
          <div className="text-purple-600 mb-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h4 className="font-semibold text-sm text-gray-800">Commission</h4>
          <p className="text-xs text-gray-500 mt-1">Données des ventes</p>
        </div>

        <div className="card p-4">
          <div className="text-purple-600 mb-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 9m0 0l-4 4m4-4l4 4" />
            </svg>
          </div>
          <h4 className="font-semibold text-sm text-gray-800">Solde</h4>
          <p className="text-xs text-gray-500 mt-1">Montants restant dus</p>
        </div>
      </div>
    </div>
  );
}
