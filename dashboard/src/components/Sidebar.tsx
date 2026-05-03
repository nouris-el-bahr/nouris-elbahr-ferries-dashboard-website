"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, CreditCard, FileSpreadsheet, LayoutDashboard, Zap } from "lucide-react";

const NAV_ITEMS = [
  { href: "/",           icon: LayoutDashboard, label: "Tableau de bord"          },
  { href: "/payment",    icon: CreditCard,      label: "Rapport de paiement"     },
  { href: "/sales",      icon: BarChart2,       label: "Rapport de ventes"       },
  { href: "/consolidated", icon: Zap,          label: "Facture consolidée"      },
  { href: "/results",    icon: FileSpreadsheet, label: "Résultats"               },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 min-h-screen bg-nouris-navy flex flex-col shrink-0">
      {/* Brand */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-nouris rounded-xl flex items-center justify-center shrink-0 shadow-lg">
            <span className="text-white font-bold text-base">N</span>
          </div>
          <div>
            <p className="text-white font-bold text-base leading-tight">Nouris</p>
            <p className="text-nouris text-xs leading-tight tracking-wide">El Bahr</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                active
                  ? "bg-nouris text-white shadow-sm"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              }`}
            >
              <Icon size={17} strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-5 border-t border-white/10">
        <p className="text-white/25 text-xs text-center">© 2026 Nouris El Bahr</p>
      </div>
    </aside>
  );
}
