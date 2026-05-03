const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

export interface Snapshot {
  name: string;
  filename: string;
}

export interface ResultFile {
  name: string;
  type: "payment" | "sales";
  size: number;
  modified: number;
}

export interface RunOutput {
  name: string;
  type: string;
}

export interface RunResult {
  success?: boolean;
  files?: RunOutput[];
  error?: string;
}

export const api = {
  baseUrl: API_BASE,

  async getSnapshots(): Promise<Snapshot[]> {
    const res = await fetch(`${API_BASE}/api/snapshots`);
    if (!res.ok) throw new Error("Impossible de charger les snapshots");
    return res.json();
  },

  async listFolder(
    folderPath: string,
    format: string,
    files?: File[]
  ): Promise<{
    folder_path: string;
    format: string;
    files: Array<{ name: string; path: string; size: number }>;
    count: number;
  }> {
    console.log("[listFolder] Called with:", { folderPath, format, filesCount: files?.length ?? 0 });

    // If files from webkitdirectory are provided, use them directly
    if (files && files.length > 0) {
      console.log("[listFolder] Processing files locally...");
      const filteredFiles: Array<{ name: string; path: string; size: number }> = [];
      const extensions = format === "Csv" ? [".csv"] : [".xlsx", ".xls"];

      for (const file of files) {
        const fileExt = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
        if (extensions.includes(fileExt)) {
          filteredFiles.push({
            name: file.name,
            path: (file as any).webkitRelativePath || file.name,
            size: file.size,
          });
        }
      }

      console.log("[listFolder] Found files:", filteredFiles);
      return {
        folder_path: folderPath,
        format,
        files: filteredFiles.sort((a, b) => a.name.localeCompare(b.name)),
        count: filteredFiles.length,
      };
    }

    // Fallback: send to backend for filesystem path listing
    console.log("[listFolder] No files provided, falling back to backend...");
    const res = await fetch(`${API_BASE}/api/list-folder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder_path: folderPath, format }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Erreur lors de la lecture du dossier");
    return data;
  },

  async uploadSnapshot(params: {
    files:   FileList;
    refDate: string;
    format:  string;
  }): Promise<Snapshot> {
    const fd = new FormData();
    Array.from(params.files).forEach((f) => fd.append("files", f));
    fd.append("ref_date", params.refDate);
    fd.append("format",   params.format);

    const res = await fetch(`${API_BASE}/api/snapshots/upload`, { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Échec de l'archivage");
    return data;
  },

  async runPayment(params: {
    snapshotName:  string;
    invoiceFile:   File;
    factDate:      string;
    periodStart:   string;
    periodEnd:     string;
  }): Promise<RunResult> {
    const fd = new FormData();
    fd.append("snapshot_name", params.snapshotName);
    fd.append("invoice_file",  params.invoiceFile);
    fd.append("fact_date",     params.factDate);
    fd.append("period_start",  params.periodStart);
    fd.append("period_end",    params.periodEnd);

    const res = await fetch(`${API_BASE}/api/payment/run`, { method: "POST", body: fd });
    return res.json();
  },

  async runSales(params: {
    files:         FileList;
    downloadDate:  string;
    vatSuffix:     string;
    format:        string;
    mode:          string;
    onlyCheckedIn: boolean;
  }): Promise<RunResult> {
    const fd = new FormData();
    Array.from(params.files).forEach((f) => fd.append("files", f));
    fd.append("download_date",   params.downloadDate);
    fd.append("vat_suffix",      params.vatSuffix);
    fd.append("format",          params.format);
    fd.append("mode",            params.mode);
    fd.append("only_checked_in", String(params.onlyCheckedIn));

    const res = await fetch(`${API_BASE}/api/sales/run`, { method: "POST", body: fd });
    return res.json();
  },

  async getResults(): Promise<ResultFile[]> {
    const res = await fetch(`${API_BASE}/api/results`);
    if (!res.ok) throw new Error("Impossible de charger les résultats");
    return res.json();
  },

  getDownloadUrl(name: string, type: string): string {
    return `${API_BASE}/api/results/download?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
  },
};
