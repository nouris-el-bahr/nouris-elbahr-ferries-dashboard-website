"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";
import { useAppDispatch, useAppSelector } from "@/store";
import { fetchResults, setFilter, ResultFilter } from "@/store/slices/resultsSlice";
import { Download, RefreshCw } from "lucide-react";

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function ResultsPage() {
  const dispatch = useAppDispatch();
  const { list, loading, filter } = useAppSelector((s) => s.results);

  useEffect(() => { dispatch(fetchResults()); }, [dispatch]);

  const filtered      = list.filter((r) => filter === "all" || r.type === filter);
  const paymentCount  = list.filter((r) => r.type === "payment").length;
  const salesCount    = list.filter((r) => r.type === "sales").length;

  const tabs: { key: ResultFilter; label: string }[] = [
    { key: "all",     label: `Tous (${list.length})` },
    { key: "payment", label: `Paiement (${paymentCount})` },
    { key: "sales",   label: `Ventes (${salesCount})` },
  ];

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-nouris-navy">Résultats</h1>
          <p className="text-gray-500 text-sm mt-1">Tous les fichiers générés</p>
        </div>
        <button
          onClick={() => dispatch(fetchResults())}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-nouris transition-colors"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Actualiser
        </button>
      </div>

      <div className="flex gap-1 mb-6 bg-white rounded-xl p-1 border border-gray-100 shadow-sm w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => dispatch(setFilter(t.key))}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
              filter === t.key
                ? "bg-nouris-navy text-white shadow-sm"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <p className="text-sm text-gray-400 py-4">Chargement…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">Aucun résultat trouvé.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="pb-3 font-medium">Fichier</th>
                <th className="pb-3 font-medium w-24">Type</th>
                <th className="pb-3 font-medium w-20">Taille</th>
                <th className="pb-3 font-medium w-44">Modifié le</th>
                <th className="pb-3 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={`${r.type}-${r.name}`}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                  <td className="py-3 pr-4 text-gray-800 max-w-xs">
                    <span className="font-mono text-xs break-all">{r.name}</span>
                  </td>
                  <td className="py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      r.type === "payment" ? "bg-blue-50 text-blue-700" : "bg-teal-50 text-teal-700"
                    }`}>
                      {r.type === "payment" ? "Paiement" : "Ventes"}
                    </span>
                  </td>
                  <td className="py-3 text-gray-500">{formatSize(r.size)}</td>
                  <td className="py-3 text-gray-500 text-xs">{formatDate(r.modified)}</td>
                  <td className="py-3 text-right">
                    <a href={api.getDownloadUrl(r.name, r.type)} download={r.name}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-nouris hover:text-nouris-d transition-colors">
                      <Download size={13} /> Télécharger
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
