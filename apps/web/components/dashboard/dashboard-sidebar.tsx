"use client";

import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bot,
  BriefcaseBusiness,
  FileText,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "@/components/brand";

type DashboardUser = { displayName: string; email: string; initials: string };

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  available: boolean;
};

const navigation: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard, available: true },
  { label: "My CVs", href: "/dashboard#cv-library", icon: FileText, available: true },
  { label: "Job Opportunities", href: "/dashboard/jobs", icon: BriefcaseBusiness, available: true },
  { label: "Interview Coach", href: "/dashboard/interviews", icon: MessageSquareText, available: true },
  { label: "AI Assistant", href: "/dashboard/assistant", icon: Bot, available: false },
  { label: "Saved Jobs", href: "/dashboard/saved", icon: Sparkles, available: false },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3, available: false },
];

export function DashboardSidebar({ user, mobileOpen, onClose }: { user: DashboardUser; mobileOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();

  return (
    <aside
      aria-label="CareerPilot workspace navigation"
      className={`dashboard-sidebar z-50 flex w-[255px] shrink-0 flex-col border-r px-4 py-6 transition-transform duration-200 lg:sticky lg:top-0 lg:flex lg:h-screen lg:translate-x-0 ${mobileOpen ? "fixed inset-y-0 left-0" : "hidden"}`}
    >
      <div className="flex items-center justify-between px-2">
        <Brand />
        <button type="button" onClick={onClose} className="dashboard-focus grid size-9 place-items-center rounded-xl text-muted hover:bg-panel-elevated hover:text-ink lg:hidden" aria-label="Close navigation">
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-10 px-3 text-[10px] font-black uppercase tracking-[.2em] text-muted/70">Workspace</div>
      <nav className="mt-3 space-y-1" aria-label="Workspace">
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = item.available && (item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href.split("#")[0]));
          if (!item.available) {
            return (
              <button key={item.label} type="button" disabled title={`${item.label} is coming soon`} className="group flex w-full cursor-not-allowed items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold text-muted/45">
                <Icon className="size-[17px]" />
                <span className="flex-1">{item.label}</span>
                <span className="text-[9px] font-black uppercase tracking-wider">Soon</span>
              </button>
            );
          }
          return (
            <Link key={item.label} href={item.href} onClick={onClose} className={`dashboard-focus flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition-colors ${active ? "bg-accent/12 text-accent" : "text-muted hover:bg-panel-elevated hover:text-ink"}`}>
              <Icon className="size-[17px]" />
              <span>{item.label}</span>
              {active && <span className="ml-auto size-1.5 rounded-full bg-accent" aria-hidden="true" />}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-4 border-t border-line/70 pt-5">
        <button type="button" disabled title="Settings are coming soon" className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold text-muted/50">
          <Settings className="size-[17px]" />
          <span>Settings</span>
          <span className="ml-auto text-[9px] font-black uppercase tracking-wider">Soon</span>
        </button>
        <div className="flex items-center gap-3 rounded-2xl border border-line/70 bg-panel-elevated/55 p-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-xs font-black text-accent-ink">{user.initials || "CP"}</span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-black text-ink">{user.displayName}</span>
            <span className="mt-0.5 block truncate text-[10px] text-muted">{user.email}</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
