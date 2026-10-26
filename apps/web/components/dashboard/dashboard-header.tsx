"use client";

import { Bell, Menu, Moon, Search, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export function DashboardHeader({ displayName, initials, onOpenMenu }: { displayName: string; initials: string; onOpenMenu: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <header className="dashboard-header sticky top-0 z-30 flex h-[74px] items-center justify-between border-b px-5 sm:px-8 lg:px-10">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onOpenMenu} className="dashboard-focus grid size-10 place-items-center rounded-xl border border-line/70 bg-panel text-muted hover:text-ink lg:hidden" aria-label="Open navigation">
          <Menu className="size-4" />
        </button>
        <div className="hidden items-center gap-2 text-sm text-muted sm:flex">
          <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
          <span>Personal career workspace</span>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <button type="button" disabled title="Global search is coming soon" className="dashboard-focus hidden h-10 items-center gap-2 rounded-xl border border-line/70 bg-panel px-3 text-xs font-bold text-muted/60 transition-colors hover:text-muted sm:flex" aria-label="Search, coming soon">
          <Search className="size-4" />
          <span>Search</span>
          <kbd className="rounded-md border border-line/70 px-1.5 py-0.5 text-[9px] font-black">⌘K</kbd>
        </button>
        <button type="button" disabled title="Notifications are coming soon" className="dashboard-focus grid size-10 place-items-center rounded-xl border border-line/70 bg-panel text-muted/55" aria-label="Notifications, coming soon">
          <Bell className="size-4" />
        </button>
        <button type="button" onClick={toggleTheme} className="dashboard-focus grid size-10 place-items-center rounded-xl border border-line/70 bg-panel text-muted transition-colors hover:bg-panel-elevated hover:text-ink" aria-pressed={isDark} aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"} title={isDark ? "Switch to light theme" : "Switch to dark theme"}>
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
        <button type="button" disabled title={`${displayName} account menu is coming soon`} className="grid size-10 place-items-center rounded-xl bg-accent text-xs font-black text-accent-ink disabled:cursor-default" aria-label={`${displayName} account menu, coming soon`}>
          {initials || "CP"}
        </button>
      </div>
    </header>
  );
}

