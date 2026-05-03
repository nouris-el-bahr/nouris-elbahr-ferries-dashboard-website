"use client";

import { useRef } from "react";
import { File, FolderOpen } from "lucide-react";

interface PathInputProps {
  label:    string;
  hint?:    string;
  mode?:    "folder" | "file";
  /** Display label for the current selection (folder name or file name). */
  selected: string;
  onSelect: (files: FileList) => void;
  accept?:  string;
}

export default function PathInput({
  label, hint, mode = "folder", selected, onSelect, accept,
}: PathInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const Icon = mode === "folder" ? FolderOpen : File;

  const handleClick = () => {
    const el = inputRef.current;
    if (!el) return;
    if (mode === "folder") {
      el.setAttribute("webkitdirectory", "");
      el.removeAttribute("accept");
    } else {
      el.removeAttribute("webkitdirectory");
      if (accept) el.setAttribute("accept", accept);
    }
    el.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) onSelect(e.target.files);
    e.target.value = "";
  };

  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <Icon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <div className="input-field pl-9 font-mono text-xs flex items-center min-h-[38px] text-gray-500 truncate select-none">
            {selected || (
              <span className="text-gray-300">
                {mode === "folder" ? "Aucun dossier sélectionné" : "Aucun fichier sélectionné"}
              </span>
            )}
          </div>
        </div>
        <button type="button" onClick={handleClick} className="btn-navy shrink-0 px-4">
          <Icon size={15} />
          Parcourir
        </button>
      </div>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}

      {/* Hidden native input — webkitdirectory set dynamically to avoid TS error */}
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
