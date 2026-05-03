"use client";

import { useState, useMemo } from "react";
import { File, FileText, CheckCircle2, AlertCircle } from "lucide-react";

interface FileListingPreviewProps {
  files: FileList;
  format: "Csv" | "Xlsx";
  onFormatChange: (format: "Csv" | "Xlsx") => void;
  isLoading?: boolean;
}

export default function FileListingPreview({
  files,
  format,
  onFormatChange,
  isLoading = false,
}: FileListingPreviewProps) {
  const [showAll, setShowAll] = useState(false);

  // Filter files based on format
  const fileArray = Array.from(files);
  const extensions = format === "Csv" ? [".csv"] : [".xlsx", ".xls"];
  const filtered = fileArray.filter((f) =>
    extensions.some((ext) => f.name.toLowerCase().endsWith(ext))
  );
  const invalid = fileArray.filter(
    (f) => !extensions.some((ext) => f.name.toLowerCase().endsWith(ext))
  );

  // Calculate totals
  const totalSize = filtered.reduce((sum, f) => sum + f.size, 0);
  const displayFiles = showAll ? filtered : filtered.slice(0, 5);

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-20 bg-gradient-to-r from-gray-100 to-gray-50 rounded-lg animate-pulse" />
        <div className="h-16 bg-gray-50 rounded-lg animate-pulse" />
        <div className="h-16 bg-gray-50 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Format selector */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm font-medium text-blue-900 mb-3">Format du fichier</p>
        <div className="flex gap-3">
          {(["Csv", "Xlsx"] as const).map((fmt) => (
            <button
              key={fmt}
              onClick={() => onFormatChange(fmt)}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                format === fmt
                  ? "bg-blue-600 text-white shadow-md"
                  : "bg-white text-blue-600 border border-blue-200 hover:border-blue-400"
              }`}
            >
              {fmt === "Csv" ? "CSV" : "Excel (XLSX/XLS)"}
            </button>
          ))}
        </div>
      </div>

      {/* File count and size */}
      <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-4">
        <div>
          <p className="text-sm font-medium text-green-900">
            {filtered.length} fichier(s) valide(s)
          </p>
          <p className="text-xs text-green-700 mt-1">Taille totale: {formatSize(totalSize)}</p>
        </div>
        <CheckCircle2 size={24} className="text-green-600 shrink-0" />
      </div>

      {/* Invalid files warning */}
      {invalid.length > 0 && (
        <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <AlertCircle size={20} className="text-yellow-600 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-yellow-900">
              {invalid.length} fichier(s) ignoré(s)
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              Seuls les fichiers {extensions.join(" et ")} sont acceptés
            </p>
          </div>
        </div>
      )}

      {/* File list */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-700">Fichiers à télécharger</h3>
        </div>
        <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
          {displayFiles.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <File size={28} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">Aucun fichier {format === "Csv" ? "CSV" : "Excel"}</p>
            </div>
          ) : (
            displayFiles.map((file, idx) => (
              <div key={`${file.name}-${idx}`} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-3 min-w-0">
                  <FileText size={16} className="text-blue-500 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{formatSize(file.size)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        {filtered.length > 5 && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full px-4 py-2.5 text-sm text-center text-blue-600 hover:bg-blue-50 border-t border-gray-100 font-medium transition-colors"
          >
            Afficher {filtered.length - 5} fichier(s) de plus…
          </button>
        )}
      </div>
    </div>
  );
}
