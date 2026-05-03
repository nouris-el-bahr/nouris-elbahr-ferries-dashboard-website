"use client";

import { FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export interface FileProgress {
  name: string;
  size: number;
  progress: number; // 0-100
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

interface UploadProgressProps {
  files: FileProgress[];
  totalProgress: number; // 0-100
  isComplete: boolean;
}

export default function UploadProgress({ files, totalProgress, isComplete }: UploadProgressProps) {
  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const successCount = files.filter((f) => f.status === "done").length;
  const errorCount = files.filter((f) => f.status === "error").length;

  return (
    <div className="space-y-4">
      {/* Overall progress */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-blue-900">Progression globale</p>
          <span className="text-sm font-bold text-blue-600">{totalProgress}%</span>
        </div>
        <div className="w-full bg-blue-100 rounded-full h-2 overflow-hidden">
          <div
            className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full transition-all duration-300"
            style={{ width: `${totalProgress}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-3 text-xs text-blue-700">
          <span>
            {successCount}/{files.length} fichier(s) téléchargé(s)
          </span>
          {isComplete && <span className="font-semibold text-green-600">✓ Terminé</span>}
        </div>
      </div>

      {/* File list with individual progress */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-700">Détails du téléchargement</h3>
        </div>
        <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
          {files.map((file, idx) => (
            <div key={`${file.name}-${idx}`} className="px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-start gap-3 mb-2">
                <FileText size={16} className="text-blue-500 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                    {file.status === "uploading" && (
                      <Loader2 size={14} className="text-blue-500 animate-spin shrink-0" />
                    )}
                    {file.status === "done" && (
                      <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                    )}
                    {file.status === "error" && (
                      <AlertCircle size={14} className="text-red-500 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">{formatSize(file.size)}</p>
                    <p className="text-xs font-medium text-gray-600">{file.progress}%</p>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${
                    file.status === "done"
                      ? "bg-green-500"
                      : file.status === "error"
                        ? "bg-red-500"
                        : "bg-blue-500"
                  }`}
                  style={{ width: `${file.progress}%` }}
                />
              </div>

              {/* Error message */}
              {file.error && <p className="text-xs text-red-600 mt-1.5">{file.error}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Error summary */}
      {errorCount > 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
          <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-900">
              {errorCount} erreur(s) de téléchargement
            </p>
            <p className="text-xs text-red-700 mt-1">Vérifiez les messages d'erreur ci-dessus</p>
          </div>
        </div>
      )}
    </div>
  );
}
