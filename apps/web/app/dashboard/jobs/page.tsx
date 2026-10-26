"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowUpRight, Bookmark, BriefcaseBusiness, Check, LoaderCircle, Search, ShieldCheck } from "lucide-react";
import { apiBaseUrl, csrfToken } from "@/lib/api";

type SearchState = "idle" | "queued" | "running" | "succeeded" | "partial" | "failed";
type SearchResult = {
  id: string;
  target_roles: string[];
  locations: string[];
  status: SearchState;
  provider_status: string;
  result_count: number;
  provider_count: number;
  failure_code: string | null;
};
type Match = {
  id: string;
  score: number;
  rank: number;
  matched_skills: string[];
  missing_required_skills: string[];
  evidence: { notes?: string[] };
  listing: {
    id: string;
    title: string;
    company_name: string;
    location: string | null;
    work_arrangement: string | null;
    experience_level: string | null;
    description: string;
    required_skills: string[];
    optional_skills: string[];
    salary_min_minor: number | null;
    salary_max_minor: number | null;
    salary_currency: string | null;
    published_at: string | null;
    last_verified_at: string;
    canonical_url: string;
    source: { provider_key: string; display_name: string; terms_url: string };
  };
};

export default function JobsPage() {
  const [roles, setRoles] = useState("");
  const [locations, setLocations] = useState("");
  const [arrangement, setArrangement] = useState("remote");
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!search || !["queued", "running"].includes(search.status)) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const latest = await request<SearchResult>(`/job-searches/${search.id}`);
        if (cancelled) return;
        setSearch(latest);
        if (["succeeded", "partial"].includes(latest.status)) {
          const result = await request<{ data: Match[] }>(`/job-searches/${search.id}/matches`);
          if (!cancelled) setMatches(result.data);
        } else if (latest.status === "failed") {
          setError(latest.failure_code === "provider_unconfigured" ? "No approved job provider is configured yet." : "The job search could not be completed.");
        } else {
          window.setTimeout(poll, 1800);
        }
      } catch (pollError) {
        if (!cancelled) setError(pollError instanceof Error ? pollError.message : "The job search could not be read.");
      }
    };
    const timer = window.setTimeout(poll, 1000);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [search]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetRoles = roles.split(",").map((value) => value.trim()).filter(Boolean);
    if (!targetRoles.length) {
      setError("Add at least one target role, such as Backend Engineer.");
      return;
    }
    try {
      setBusy(true);
      setError(null);
      setMatches([]);
      const created = await request<SearchResult>("/job-searches", {
        method: "POST",
        body: JSON.stringify({
          target_roles: targetRoles,
          locations: locations.split(",").map((value) => value.trim()).filter(Boolean),
          work_arrangements: arrangement ? [arrangement] : [],
        }),
      });
      setSearch(created);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The job search could not be started.");
    } finally {
      setBusy(false);
    }
  }

  async function save(listingId: string) {
    try {
      await request("/saved-jobs", { method: "POST", body: JSON.stringify({ listing_id: listingId }) });
      setSaved((current) => ({ ...current, [listingId]: true }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The job could not be saved.");
    }
  }

  const statusCopy = search?.status === "queued" || search?.status === "running"
    ? "Checking approved sources…"
    : search?.provider_status === "unconfigured"
      ? "No approved source is configured in this environment."
      : search?.provider_status === "partial"
        ? "Some sources responded; results are marked with their verification time."
        : search?.result_count
          ? `${search.result_count} normalized opportunities found.`
          : "No verified opportunities matched this search.";

  return <div className="mx-auto max-w-6xl pb-24">
    <div className="flex flex-col justify-between gap-5 border-b pb-8 sm:flex-row sm:items-end">
      <div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-accent">Phase 3 · Job intelligence</p><h1 className="mt-2 text-4xl font-black tracking-[-.04em] sm:text-5xl">Find work that fits.</h1><p className="mt-3 max-w-2xl text-muted">Search approved job feeds, then see exactly which CV evidence matches and what is still missing.</p></div>
      <div className="flex items-center gap-2 text-xs font-bold text-muted"><ShieldCheck className="size-4 text-accent"/> No fabricated vacancies</div>
    </div>
    <form onSubmit={submit} className="mt-8 grid gap-4 rounded-2xl border bg-panel p-6 sm:grid-cols-2 sm:p-8">
      <label className="sm:col-span-2"><span className="text-sm font-extrabold">Target roles</span><input value={roles} onChange={(event) => setRoles(event.target.value)} placeholder="Backend Engineer, Python Developer" className="mt-2 h-12 w-full rounded-xl border bg-canvas px-4 outline-none focus:border-accent" /></label>
      <label><span className="text-sm font-extrabold">Locations</span><input value={locations} onChange={(event) => setLocations(event.target.value)} placeholder="Remote, London, Karachi" className="mt-2 h-12 w-full rounded-xl border bg-canvas px-4 outline-none focus:border-accent" /></label>
      <label><span className="text-sm font-extrabold">Work arrangement</span><select value={arrangement} onChange={(event) => setArrangement(event.target.value)} className="mt-2 h-12 w-full rounded-xl border bg-canvas px-4 outline-none focus:border-accent"><option value="">Any arrangement</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></select></label>
      <div className="flex items-end sm:col-span-2"><button disabled={busy} className="inline-flex h-12 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-extrabold text-canvas disabled:opacity-60"><Search className="size-4"/>{busy ? "Starting search…" : "Search verified jobs"}</button></div>
    </form>
    {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-semibold text-red-700">{error}</p>}
    {search && <section className="mt-8"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-accent">Latest search</p><h2 className="mt-1 text-2xl font-black">{statusCopy}</h2></div><span className="rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-muted">{search.provider_status}</span></div>
      {search.status === "queued" || search.status === "running" ? <div className="mt-8 flex items-center gap-3 rounded-2xl border bg-panel p-8 text-muted"><LoaderCircle className="size-5 animate-spin text-accent"/> Normalizing provider responses and comparing your CV…</div> : matches.length ? <div className="mt-6 space-y-4">{matches.map((match) => <article key={match.id} className="rounded-2xl border bg-panel p-6 sm:p-8"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-accent/10 text-sm font-black text-accent">{match.rank.toString().padStart(2, "0")}</span><div><h3 className="text-xl font-black">{match.listing.title}</h3><p className="mt-1 text-sm font-bold text-muted">{match.listing.company_name} · {match.listing.location ?? "Location not provided"}</p></div></div><div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-muted">{match.listing.work_arrangement && <span className="rounded-full border px-2.5 py-1">{match.listing.work_arrangement}</span>}{match.listing.experience_level && <span className="rounded-full border px-2.5 py-1">{match.listing.experience_level}</span>}<span className="rounded-full bg-accent/10 px-2.5 py-1 text-accent">Verified relevance {match.score}/100</span></div></div><div className="flex gap-2"><button type="button" onClick={() => save(match.listing.id)} disabled={saved[match.listing.id]} className="inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-extrabold disabled:text-accent">{saved[match.listing.id] ? <Check className="size-4"/> : <Bookmark className="size-4"/>}{saved[match.listing.id] ? "Saved" : "Save"}</button><a href={match.listing.canonical_url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-3 text-sm font-extrabold text-canvas">View source <ArrowUpRight className="size-4"/></a></div></div><div className="mt-6 grid gap-6 border-t pt-6 lg:grid-cols-[1fr_.7fr]"><p className="text-sm leading-7 text-muted">{match.listing.description.slice(0, 560)}{match.listing.description.length > 560 ? "…" : ""}</p><div><p className="text-xs font-extrabold uppercase tracking-wider text-muted">Why it matches</p><p className="mt-2 text-sm leading-6">{match.matched_skills.length ? `CV evidence matches ${match.matched_skills.join(", ")}.` : "No direct skill evidence was found in the current extracted CV."}</p>{match.missing_required_skills.length > 0 && <p className="mt-3 text-sm leading-6 text-amber-700">Missing or unverified: {match.missing_required_skills.join(", ")}.</p>}<p className="mt-3 text-xs font-semibold text-muted">Source: {match.listing.source.display_name} · Verified {new Date(match.listing.last_verified_at).toLocaleString()}</p><p className="mt-2 text-xs font-semibold text-muted">Relevance is a job-related indicator, not a hiring prediction.</p></div></div></article>)}</div> : <div className="mt-8 rounded-2xl border bg-panel p-8"><BriefcaseBusiness className="size-7 text-accent"/><h3 className="mt-5 text-lg font-black">{search.provider_status === "unconfigured" ? "Connect an approved source to see real openings." : "No verified matches yet."}</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{search.provider_status === "unconfigured" ? "Configure Greenhouse board tokens or Lever site names on the server. The UI intentionally stays empty until a permitted source responds." : "Try another role or location. Unknown provider fields are kept unknown rather than treated as a rejection."}</p></div>}
    </section>}
  </div>;
}

async function request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = csrfToken();
  if (!token) throw new Error("Your session security token is missing. Refresh the page and try again.");
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": token, ...(init.headers ?? {}) },
  });
  const body = await response.json().catch(() => null) as { detail?: string } | null;
  if (!response.ok) throw new Error(body?.detail ?? "The request could not be completed.");
  return body as T;
}
