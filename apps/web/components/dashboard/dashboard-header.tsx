"use client";

import { Bell, LoaderCircle, LogOut, Menu, Moon, Search, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { apiBaseUrl, csrfToken } from "@/lib/api";

export function DashboardHeader({ displayName, initials, onOpenMenu }: { displayName: string; initials: string; onOpenMenu: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const isDark = theme === "dark";
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function handleLogout() {
    if (loggingOut) return;
    const token = csrfToken();
    if (!token) {
      setLogoutError("Your security token is missing. Refresh the page and try again.");
      return;
    }
    setLoggingOut(true);
    setLogoutError(null);
    try {
      const response = await fetch(`${apiBaseUrl()}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": token },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(payload?.detail || "We could not sign you out. Please try again.");
      }
      router.replace("/login");
      router.refresh();
    } catch (reason) {
      setLoggingOut(false);
      setLogoutError(reason instanceof Error ? reason.message : "We could not sign you out. Please try again.");
    }
  }

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
        <div className="relative">
          <button type="button" onClick={() => { setMenuOpen((open) => !open); setLogoutError(null); }} className="dashboard-focus grid size-10 place-items-center rounded-xl bg-accent text-xs font-black text-accent-ink transition-transform hover:scale-[1.03]" aria-label={`${displayName} account menu`} aria-expanded={menuOpen} aria-haspopup="menu">
            {initials || "CP"}
          </button>
          {menuOpen && <div className="absolute right-0 top-12 z-40 w-64 rounded-2xl border border-line bg-panel-elevated p-2 shadow-2xl" role="menu">
            <div className="border-b border-line/70 px-3 pb-3 pt-2"><p className="truncate text-sm font-black text-ink">{displayName}</p><p className="mt-1 text-xs text-muted">Account actions</p></div>
            {logoutError && <p role="alert" className="mx-1 mt-2 rounded-xl border border-red-300/25 bg-red-500/10 p-2.5 text-xs font-semibold leading-5 text-red-200">{logoutError}</p>}
            <button type="button" role="menuitem" onClick={() => void handleLogout()} disabled={loggingOut} className="dashboard-focus mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-black text-red-200 transition-colors hover:bg-red-500/10 disabled:cursor-wait disabled:opacity-60">
              {loggingOut ? <LoaderCircle className="size-4 animate-spin" /> : <LogOut className="size-4" />}
              {loggingOut ? "Signing out…" : "Log out"}
            </button>
          </div>}
        </div>
      </div>
    </header>
  );
}
