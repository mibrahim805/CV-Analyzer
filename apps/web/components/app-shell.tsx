"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Bot, BriefcaseBusiness, FileText, LayoutDashboard, MessageSquareText, Moon, Settings, Sun } from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { fetchCurrentUser, type CurrentUser } from "@/lib/current-user";
import { useTheme } from "@/components/theme-provider";

const items = [
  [LayoutDashboard, "Overview", "/dashboard"],
  [FileText, "CVs", "/dashboard/cvs"],
  [BriefcaseBusiness, "Opportunities", "/dashboard/jobs"],
  [MessageSquareText, "Coach", "/dashboard/interviews"],
  [Bot, "Assistant", "/dashboard/assistant"],
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  return <UserProvider><Shell>{children}</Shell></UserProvider>;
}

type UserContextValue = { user: CurrentUser | null; loading: boolean };
const UserContext = createContext<UserContextValue>({ user: null, loading: true });

export function useCurrentUser() {
  return useContext(UserContext);
}

function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetchCurrentUser(controller.signal)
      .then(setUser)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setUser(null);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  return <UserContext.Provider value={{ user, loading }}>{children}</UserContext.Provider>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const { user } = useCurrentUser();
  const displayName = user?.profile.display_name?.trim() || user?.email.split("@")[0] || "Account";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[244px_1fr]"><aside className="hidden border-r bg-panel px-5 py-7 lg:flex lg:flex-col"><Brand/><nav className="mt-12 space-y-1" aria-label="Workspace">{items.map(([Icon,label,href], index) => <Link key={label} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold ${index === 0 ? "bg-ink text-canvas" : "text-muted hover:bg-canvas hover:text-ink"}`}><Icon className="size-[18px]"/>{label}</Link>)}</nav><Link href="/dashboard/settings" className="mt-auto flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-muted hover:bg-canvas hover:text-ink"><Settings className="size-[18px]"/>Settings</Link></aside><div><header className="flex h-20 items-center justify-between border-b bg-panel/80 px-5 backdrop-blur sm:px-8"><div className="lg:hidden"><Brand/></div><p className="hidden text-sm font-semibold text-muted lg:block">Personal career workspace</p><div className="flex items-center gap-3"><ThemeToggle/><button className="grid size-10 place-items-center rounded-full bg-accent text-sm font-black text-accent-ink" aria-label={`Open ${displayName} account menu`}>{initials || "??"}</button></div></header><main className="px-5 py-8 sm:px-8 lg:px-12 lg:py-12">{children}</main></div><nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t bg-panel/95 px-2 py-2 backdrop-blur lg:hidden" aria-label="Mobile workspace">{items.slice(0,5).map(([Icon,label,href]) => <Link key={label} href={href} className="flex min-w-14 flex-col items-center gap-1 rounded-lg p-1.5 text-[10px] font-bold text-muted"><Icon className="size-5"/>{label}</Link>)}</nav></div>;
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return <button type="button" onClick={toggleTheme} aria-pressed={isDark} aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"} title={isDark ? "Switch to light theme" : "Switch to dark theme"} className="grid size-10 place-items-center rounded-full border bg-canvas text-ink transition-colors hover:bg-ink hover:text-canvas">{isDark ? <Sun className="size-4"/> : <Moon className="size-4"/>}</button>;
}
