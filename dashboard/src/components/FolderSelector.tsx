"use client";

import { useRef, useState } from "react";
import { FolderOpen, X } from "lucide-react";

interface FolderSelectorProps {
  label: string;
  hint?: string;
  onFolderSelect: (path: string, files?: File[]) => void;
  disabled?: boolean;
}

export default function FolderSelector({
  label,
  hint,
  onFolderSelect,
  disabled = false,
}: FolderSelectorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedPath, setSelectedPath] = useState("");

  const handleSelectFolder = () => {
    if (inputRef.current) {
      inputRef.current.setAttribute("webkitdirectory", "");
      inputRef.current.click();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileList = e.target.files;
      const firstFile = fileList[0];
      const relativePath = firstFile.webkitRelativePath || firstFile.name;
      const pathParts = relativePath.split("/");
      const folderName = pathParts[0];

      // Convert FileList to File array (FileList gets stale after input reset)
      const filesArray = Array.from(fileList);

      setSelectedPath(folderName);
      onFolderSelect(folderName, filesArray);
    }
    // Reset input so same folder can be selected again
    e.target.value = "";
  };

  const handleClear = () => {
    setSelectedPath("");
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex gap-2">
        <div className="flex-1 flex items-center bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5">
          {selectedPath ? (
            <div className="flex items-center justify-between flex-1 min-w-0">
              <p className="text-sm font-mono text-gray-700 truncate">{selectedPath}</p>
              <button
                type="button"
                onClick={handleClear}
                className="text-gray-400 hover:text-gray-600 ml-2 shrink-0"
                title="Effacer"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Aucun dossier sélectionné</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleSelectFolder}
          disabled={disabled}
          className="btn-navy shrink-0 px-4"
        >
          <FolderOpen size={15} />
          Sélectionner
        </button>
      </div>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}

      {/* Hidden file input with webkitdirectory */}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
