"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchCurrentUser, type CurrentUser } from "@/lib/current-user";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return <UserProvider><Shell>{children}</Shell></UserProvider>;
}

type UserContextValue = { user: CurrentUser | null; loading: boolean };
const UserContext = createContext<UserContextValue>({ user: null, loading: true });

export function useCurrentUser() {
  return useContext(UserContext);
}

function UserProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetchCurrentUser(controller.signal)
      .then((nextUser) => {
        if (active) setUser(nextUser);
      })
      .catch((error: unknown) => {
        if (active && !(error instanceof DOMException && error.name === "AbortError")) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      const next = pathname.startsWith("/") && !pathname.startsWith("//") ? pathname : "/dashboard";
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [loading, pathname, router, user]);

  return <UserContext.Provider value={{ user, loading }}>{children}</UserContext.Provider>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useCurrentUser();
  const [mobileOpen, setMobileOpen] = useState(false);
  const displayName = user?.profile.display_name?.trim() || user?.email.split("@")[0] || "Account";
  const initials = useMemo(
    () => displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
    [displayName],
  );
  if (loading || !user) {
    return <div className="grid min-h-screen place-items-center bg-canvas px-6 text-sm font-semibold text-muted" role="status">Checking your secure session…</div>;
  }
  const dashboardUser = { displayName, email: user?.email ?? "Secure workspace", initials };

  return (
    <div className="dashboard-app-shell min-h-screen lg:grid lg:grid-cols-[255px_1fr]">
      {mobileOpen && <button type="button" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm lg:hidden" aria-label="Close navigation overlay" />}
      <DashboardSidebar user={dashboardUser} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="min-w-0">
        <DashboardHeader displayName={displayName} initials={initials} onOpenMenu={() => setMobileOpen(true)} />
        <main className="px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
