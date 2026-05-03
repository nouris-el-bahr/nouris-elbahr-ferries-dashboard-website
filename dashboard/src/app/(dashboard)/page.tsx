"use client";

import Link from "next/link";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { useAppDispatch, useAppSelector } from "@/store";
import { fetchResults } from "@/store/slices/resultsSlice";
import { ArrowRight, BarChart2, CreditCard, FileText } from "lucide-react";

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function StatCard({ label, value, icon: Icon, bg }: {
  label: string; value: number; icon: React.ElementType; bg: string;
}) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-nouris-navy">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

export default function HomePage() {
  const dispatch = useAppDispatch();
  const { list, loading } = useAppSelector((s) => s.results);

  useEffect(() => { dispatch(fetchResults()); }, [dispatch]);

  const paymentCount = list.filter((r) => r.type === "payment").length;
  const salesCount   = list.filter((r) => r.type === "sales").length;
  const recent       = list.slice(0, 5);

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-nouris-navy">Tableau de bord</h1>
        <p className="text-gray-500 text-sm mt-1">Gestion des rapports Nouris El Bahr</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Total rapports"        value={list.length}    icon={FileText}  bg="bg-nouris-navy" />
        <StatCard label="Rapports de paiement"  value={paymentCount}   icon={CreditCard} bg="bg-nouris" />
        <StatCard label="Rapports de ventes"    value={salesCount}     icon={BarChart2}  bg="bg-nouris-d" />
      </div>

      <div className="card mb-8">
        <h2 className="font-semibold text-nouris-navy mb-4">Actions rapides</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/payment" className="btn-primary"><CreditCard size={16} /> Rapport de paiement</Link>
          <Link href="/sales"   className="btn-navy"><BarChart2 size={16} /> Rapport de ventes</Link>
          <Link href="/results" className="flex items-center gap-2 text-sm text-gray-500 hover:text-nouris transition-colors px-2 py-2.5">
            Voir tous les résultats <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-nouris-navy mb-4">Résultats récents</h2>
        {loading ? (
          <p className="text-sm text-gray-400 py-2">Chargement…</p>
        ) : recent.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">Aucun résultat pour le moment.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="pb-2 font-medium">Fichier</th>
                <th className="pb-2 font-medium w-24">Type</th>
                <th className="pb-2 font-medium w-20">Taille</th>
                <th className="pb-2 font-medium w-32">Date</th>
                <th className="pb-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={`${r.type}-${r.name}`}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                  <td className="py-2.5 text-gray-800 pr-4 max-w-xs truncate">
                    <span className="font-mono text-xs">{r.name}</span>
                  </td>
                  <td className="py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      r.type === "payment" ? "bg-blue-50 text-blue-700" : "bg-teal-50 text-teal-700"
                    }`}>
                      {r.type === "payment" ? "Paiement" : "Ventes"}
                    </span>
                  </td>
                  <td className="py-2.5 text-gray-500">{formatSize(r.size)}</td>
                  <td className="py-2.5 text-gray-500 text-xs">{formatDate(r.modified)}</td>
                  <td className="py-2.5 text-right">
                    <a href={api.getDownloadUrl(r.name, r.type)} download={r.name}
                      className="text-nouris hover:text-nouris-d text-xs font-medium transition-colors">
                      Télécharger
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
