"use client";

import { FileText, Loader2 } from "lucide-react";

export interface FileItem {
  name: string;
  path: string;
  size: number;
}

interface FileListDisplayProps {
  files: FileItem[];
  loading?: boolean;
  label?: string;
}

export default function FileListDisplay({
  files,
  loading = false,
  label = "Fichiers trouvés",
}: FileListDisplayProps) {
  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
          <Loader2 size={16} className="animate-spin" />
          Chargement des fichiers...
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-gradient-to-r from-gray-100 to-gray-50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (files.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
        <div className="text-xs text-gray-500">
          {files.length} fichier(s) • {formatSize(totalSize)}
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
          {files.map((file, idx) => (
            <div
              key={`${file.name}-${idx}`}
              className="px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3"
            >
              <FileText size={16} className="text-blue-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{formatSize(file.size)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
