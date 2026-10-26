"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight, Bookmark, BriefcaseBusiness, Check, CheckCircle2, ChevronDown, Clock3,
  Filter, LoaderCircle, MapPin, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, X,
} from "lucide-react";
import { CVDocument, CVProfessionalProfile, CVVersion, ProfessionalProfile, getCVProfessionalProfile, getCVVersion, listCVDocuments, refreshCVProfessionalProfile, updateCVProfessionalProfile } from "@/lib/cv-api";
import {
  getJobMatches, getJobSearch, getLatestJobSearch, getPreferences, getSavedJobs, getJobMatches as loadMatches,
  cancelJobSearch, JobListing, JobMatch, JobPreferences, JobSearch, removeSavedJob, saveJob, startJobSearch, updatePreferences,
} from "@/lib/jobs-api";

type Tab = "all" | "best" | "remote" | "saved";
type CVOption = { document: CVDocument; version: CVVersion };

const arrangementOptions = ["remote", "hybrid", "onsite"];
const experienceOptions = ["internship", "entry", "junior", "mid", "senior", "lead"];
const SEARCH_POLL_TIMEOUT_MS = 135_000;

function csv(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function monogram(company: string) { return company.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "CP"; }
function salaryLabel(job: JobListing) {
  if (job.salary_min_minor == null && job.salary_max_minor == null) return "Salary not provided";
  const currency = job.salary_currency || "";
  const format = (value: number) => `${currency} ${(value / 100).toLocaleString()}`.trim();
  if (job.salary_min_minor != null && job.salary_max_minor != null) return `${format(job.salary_min_minor)} – ${format(job.salary_max_minor)}`;
  return format(job.salary_min_minor ?? job.salary_max_minor ?? 0);
}
function matchLabel(score: number) { return score >= 75 ? "Strong relevance" : score >= 50 ? "Relevant" : "Related opportunity"; }
function dateLabel(value: string | null) { return value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Date not provided"; }

export default function JobsPage() {
  const [preferences, setPreferences] = useState<JobPreferences | null>(null);
  const [cvOptions, setCvOptions] = useState<CVOption[]>([]);
  const [selectedCV, setSelectedCV] = useState("");
  const [profile, setProfile] = useState<CVProfessionalProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [roles, setRoles] = useState("");
  const [locations, setLocations] = useState("");
  const [arrangement, setArrangement] = useState("");
  const [experience, setExperience] = useState("");
  const [salaryMinimum, setSalaryMinimum] = useState("");
  const [salaryCurrency, setSalaryCurrency] = useState("USD");
  const [keyword, setKeyword] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("any");
  const [search, setSearch] = useState<JobSearch | null>(null);
  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>("all");
  const [details, setDetails] = useState<JobMatch | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadInitial() {
    setLoading(true); setError(null);
    try {
      const [prefs, savedResponse, documents, latest] = await Promise.all([getPreferences(), getSavedJobs(), listCVDocuments(), getLatestJobSearch()]);
      setPreferences(prefs); setRoles(prefs.target_roles.join(", ")); setLocations(prefs.locations.join(", "));
      setArrangement(prefs.work_arrangements[0] || ""); setExperience(prefs.experience_levels[0] || "");
      setSalaryMinimum(prefs.salary_min_minor == null ? "" : String(prefs.salary_min_minor / 100)); setSalaryCurrency(prefs.salary_currency || "USD");
      setSaved(Object.fromEntries(savedResponse.data.map((item) => [item.listing_id, item.id])));
      const versions = await Promise.all(documents.filter((doc) => doc.active_version_id).map(async (doc) => {
        try { const version = await getCVVersion(doc.id, doc.active_version_id as string); return version.status === "ready" ? { document: doc, version } : null; } catch { return null; }
      }));
      const ready = versions.filter((item): item is CVOption => item !== null); setCvOptions(ready);
      const latestSearch = latest.data[0];
      if (latestSearch) { setSearch(latestSearch); if (["succeeded", "partial"].includes(latestSearch.status)) setMatches((await getJobMatches(latestSearch.id)).data); }
      const activeVersionId = latestSearch?.cv_version_id || ready[0]?.version.id || "";
      setSelectedCV(activeVersionId);
      const activeOption = ready.find((item) => item.version.id === activeVersionId);
      if (activeOption) {
        try {
          const activeProfile = await getCVProfessionalProfile(activeOption.document.id, activeOption.version.id);
          setProfile(activeProfile);
          const profileRoles = activeProfile.profile?.roles.map((role) => role.title).filter(Boolean) ?? [];
          if (profileRoles.length) setRoles(profileRoles.join(", "));
        } catch (profileLoadError) {
          setProfile(null);
          setProfileError(profileLoadError instanceof Error ? profileLoadError.message : "The AI-understood CV profile is not ready.");
        }
      }
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Your job workspace could not be loaded."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadInitial(); }, []);

  async function selectCV(versionId: string) {
    setSelectedCV(versionId); setProfile(null); setProfileError(null); setMatches([]);
    const option = cvOptions.find((item) => item.version.id === versionId);
    if (!option) return;
    try {
      const nextProfile = await getCVProfessionalProfile(option.document.id, option.version.id);
      setProfile(nextProfile);
      const profileRoles = nextProfile.profile?.roles.map((role) => role.title).filter(Boolean) ?? [];
      if (profileRoles.length) setRoles(profileRoles.join(", "));
    } catch (profileLoadError) { setProfileError(profileLoadError instanceof Error ? profileLoadError.message : "The AI-understood CV profile is not ready."); }
  }
  async function refreshProfile() {
    const option = cvOptions.find((item) => item.version.id === selectedCV);
    if (!option) return;
    try {
      setProfileBusy(true); setProfileError(null);
      setProfile(await refreshCVProfessionalProfile(option.document.id, option.version.id));
    } catch (profileRefreshError) { setProfileError(profileRefreshError instanceof Error ? profileRefreshError.message : "The CV profile could not be queued."); }
    finally { setProfileBusy(false); }
  }

  useEffect(() => {
    if (!search || !["queued", "running"].includes(search.status)) return;
    let cancelled = false;
    const remaining = SEARCH_POLL_TIMEOUT_MS - Math.max(0, Date.now() - Date.parse(search.created_at));
    if (remaining <= 0) {
      void getJobSearch(search.id).then((current) => {
        if (cancelled) return;
        setSearch(current);
        if (["queued", "running"].includes(current.status)) {
          setPollingTimedOut(true);
          setError("This search is taking longer than expected. Refresh to check its final status or start a new search.");
        }
      }).catch((pollError) => {
        if (!cancelled) {
          setPollingTimedOut(true);
          setError(pollError instanceof Error ? pollError.message : "The job search status could not be loaded.");
        }
      });
      return () => { cancelled = true; };
    }
    const timer = window.setTimeout(async () => {
      try { const current = await getJobSearch(search.id); if (cancelled) return; setSearch(current); if (["succeeded", "partial"].includes(current.status)) setMatches((await loadMatches(current.id)).data); }
      catch (pollError) { if (!cancelled) setError(pollError instanceof Error ? pollError.message : "The job search status could not be loaded."); }
    }, Math.min(1800, remaining));
    const timeout = window.setTimeout(() => {
      void getJobSearch(search.id).then((current) => {
        if (cancelled) return;
        setSearch(current);
        if (["queued", "running"].includes(current.status)) {
          setPollingTimedOut(true);
          setError("This search is taking longer than expected. Refresh to check its final status or start a new search.");
        }
      }).catch((pollError) => {
        if (!cancelled) {
          setPollingTimedOut(true);
          setError(pollError instanceof Error ? pollError.message : "The job search status could not be loaded.");
        }
      });
    }, remaining);
    return () => { cancelled = true; window.clearTimeout(timer); window.clearTimeout(timeout); };
  }, [search]);

  async function runSearch(event?: FormEvent) {
    event?.preventDefault(); setError(null);
    const targetRoles = csv(roles);
    if (!profile?.profile || !["ready", "needs_review"].includes(profile.status)) { setError("Review the AI-understood CV profile before searching for personalized jobs."); return; }
    if (!selectedCV) { setError("Select a processed CV so matches can be explained with evidence."); return; }
    try {
      setBusy(true); setMatches([]);
      const created = await startJobSearch({ cv_version_id: selectedCV, target_roles: targetRoles, locations: csv(locations), work_arrangements: arrangement ? [arrangement] : [], experience_levels: experience ? [experience] : [], salary_min_minor: salaryMinimum ? Math.round(Number(salaryMinimum) * 100) : undefined, salary_currency: salaryCurrency || undefined, include_salary_unknown: true });
      setPollingTimedOut(false);
      setSearch(created);
    } catch (searchError) { setError(searchError instanceof Error ? searchError.message : "The job search could not be started."); }
    finally { setBusy(false); }
  }
  async function stopSearch() {
    if (!search || !statusBusy || cancelling) return;
    try {
      setCancelling(true); setError(null);
      const cancelledSearch = await cancelJobSearch(search.id);
      setSearch(cancelledSearch);
      setMatches([]);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "The job search could not be stopped.");
    } finally { setCancelling(false); }
  }
  async function toggleSaved(match: JobMatch) {
    try {
      const savedId = saved[match.listing.id];
      if (savedId) { await removeSavedJob(savedId); setSaved((current) => { const next = { ...current }; delete next[match.listing.id]; return next; }); }
      else { const item = await saveJob(match.listing.id); setSaved((current) => ({ ...current, [match.listing.id]: item.id })); }
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "The saved-job change could not be completed."); }
  }
  async function savePreferenceChanges(event: FormEvent) {
    event.preventDefault();
    try { const next = await updatePreferences({ target_roles: csv(roles), locations: csv(locations), work_arrangements: arrangement ? [arrangement] : [], experience_levels: experience ? [experience] : [], salary_min_minor: salaryMinimum ? Math.round(Number(salaryMinimum) * 100) : null, salary_max_minor: preferences?.salary_max_minor ?? null, salary_currency: salaryCurrency || null, include_salary_unknown: true }); setPreferences(next); setPreferencesOpen(false); }
    catch (prefError) { setError(prefError instanceof Error ? prefError.message : "Preferences could not be saved."); }
  }
  async function saveProfileChanges(nextProfile: ProfessionalProfile) {
    const option = cvOptions.find((item) => item.version.id === selectedCV);
    if (!option) return;
    try {
      const updated = await updateCVProfessionalProfile(option.document.id, option.version.id, nextProfile);
      setProfile(updated); setProfileOpen(false); setMatches([]); setSearch(null);
    } catch (profileSaveError) { setError(profileSaveError instanceof Error ? profileSaveError.message : "The CV profile could not be saved."); }
  }

  const visibleMatches = useMemo(() => {
    const now = Date.now(); const maxAge = dateFilter === "24h" ? 1 : dateFilter === "3d" ? 3 : dateFilter === "7d" ? 7 : dateFilter === "30d" ? 30 : null;
    return [...matches].filter((match) => {
      const job = match.listing; const haystack = `${job.title} ${job.company_name} ${job.description} ${job.required_skills.join(" ")}`.toLowerCase();
      if (keyword && !haystack.includes(keyword.toLowerCase())) return false;
      if (skillFilter && ![...job.required_skills, ...job.optional_skills].some((skill) => skill.toLowerCase().includes(skillFilter.toLowerCase()))) return false;
      if (arrangement && job.work_arrangement && job.work_arrangement.toLowerCase() !== arrangement) return false;
      if (experience && job.experience_level && job.experience_level.toLowerCase() !== experience) return false;
      if (maxAge && job.published_at && (now - new Date(job.published_at).getTime()) > maxAge * 86400000) return false;
      if (tab === "best" && match.score < 60) return false;
      if (tab === "remote" && !(job.work_arrangement?.toLowerCase().includes("remote") || job.location?.toLowerCase().includes("remote"))) return false;
      if (tab === "saved" && !saved[job.id]) return false;
      return true;
    }).sort((a, b) => tab === "best" || tab === "all" ? b.score - a.score : a.rank - b.rank);
  }, [matches, keyword, skillFilter, arrangement, experience, dateFilter, tab, saved]);

  if (loading) return <div className="mx-auto max-w-7xl space-y-6 pb-24"><div className="h-12 w-72 animate-pulse rounded-xl bg-panel"/><div className="h-44 animate-pulse rounded-3xl bg-panel"/><div className="grid gap-4 lg:grid-cols-2">{[1, 2, 3, 4].map((item) => <div key={item} className="h-56 animate-pulse rounded-2xl bg-panel"/>)}</div></div>;
  const statusBusy = Boolean(search && ["queued", "running"].includes(search.status) && !pollingTimedOut);
  return <div className="mx-auto max-w-7xl pb-24">
    <header className="flex flex-col justify-between gap-5 border-b pb-8 lg:flex-row lg:items-end"><div><p className="text-xs font-black uppercase tracking-[.18em] text-accent">Career intelligence</p><h1 className="mt-2 text-4xl font-black tracking-[-.04em] sm:text-5xl">Recommended Jobs</h1><p className="mt-3 max-w-2xl text-muted">Discover opportunities that match your experience, skills, and career goals.</p>{selectedCV && <p className="mt-3 text-sm font-semibold text-muted">Showing opportunities using <span className="text-ink">{cvOptions.find((item) => item.version.id === selectedCV)?.version.original_name || "your selected CV"}</span>.</p>}</div><div className="flex flex-wrap gap-2"><button onClick={() => setPreferencesOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-xl border bg-panel px-4 text-sm font-extrabold"><Settings2 className="size-4"/> Update preferences</button><button onClick={() => void loadInitial()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-extrabold text-canvas"><RefreshCw className="size-4"/> Refresh jobs</button></div></header>
    {error && <div role="alert" className="mt-5 flex items-start justify-between gap-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-semibold text-red-700"><span>{error}</span><button onClick={() => setError(null)} aria-label="Dismiss error"><X className="size-4"/></button></div>}
    {!cvOptions.length && <section className="mt-8 rounded-3xl border bg-panel p-8"><Sparkles className="size-8 text-accent"/><h2 className="mt-5 text-2xl font-black">Process a CV to unlock personalized matches.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted">CareerPilot only compares jobs with validated CV evidence. Upload and process a CV in My CVs, then return here to search genuine listings.</p></section>}
    {cvOptions.length > 0 && <>
      <form onSubmit={runSearch} className="mt-8 rounded-3xl border bg-panel p-5 shadow-sm sm:p-7"><div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_auto]"><label className="lg:col-span-2"><span className="text-xs font-black uppercase tracking-wider text-muted">AI-derived roles and interests</span><div className="mt-2 flex h-12 items-center gap-3 rounded-xl border bg-canvas px-4"><Sparkles className="size-4 text-accent"/><input value={roles} onChange={(event) => setRoles(event.target.value)} placeholder="Roles supported by your CV profile" className="min-w-0 flex-1 bg-transparent text-sm outline-none"/></div></label><label><span className="text-xs font-black uppercase tracking-wider text-muted">Matching CV</span><select value={selectedCV} onChange={(event) => void selectCV(event.target.value)} className="mt-2 h-12 w-full rounded-xl border bg-canvas px-3 text-sm outline-none">{cvOptions.map((item) => <option key={item.version.id} value={item.version.id}>{item.version.original_name}</option>)}</select></label></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-semibold text-muted"><ShieldCheck className="mr-1 inline size-4 text-accent"/>Approved providers only. Relevance is not a hiring prediction.</p><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setProfileOpen(true)} disabled={!profile?.profile} className="inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-extrabold disabled:opacity-50"><CheckCircle2 className="size-4 text-accent"/> Review CV profile</button>{statusBusy && <button type="button" onClick={() => void stopSearch()} disabled={cancelling} className="inline-flex h-11 items-center gap-2 rounded-xl border border-red-400/40 px-4 text-sm font-extrabold text-red-700 transition hover:bg-red-500/10 disabled:opacity-60"><X className="size-4"/>{cancelling ? "Stopping…" : "Stop searching"}</button>}<button disabled={busy || statusBusy || !profile?.profile} className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-black text-[#06151a] disabled:opacity-60"><Search className="size-4"/>{busy ? "Starting…" : statusBusy ? "Searching…" : "Find matching jobs"}</button></div></div></form>
      {profileError && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-semibold text-amber-800"><span>{profileError}{/not configured|AI provider/i.test(profileError) && " Configure AI_PROVIDER, AI_API_KEY, and AI_MODEL_NAME on the server, then retry profile generation."}</span><div className="flex gap-3"><button type="button" onClick={() => void selectCV(selectedCV)} className="font-black underline">Check again</button><button type="button" onClick={() => void refreshProfile()} disabled={profileBusy} className="font-black underline disabled:opacity-50">{profileBusy ? "Queuing…" : "Retry profile"}</button></div></div>}
      {profile?.profile && <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted"><span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 font-black text-accent">Profile {profile.status.replaceAll("_", " ")}</span><span>{profile.profile.skills.length} extracted skills · {profile.profile.roles.length} supported role paths · revision {profile.revision}</span></div>}
      {profile && !profile.profile && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-semibold text-amber-800"><span>AI profile status: {profile.status.replaceAll("_", " ")}. Personalized job search stays locked until the profile is validated.</span><button type="button" onClick={() => void refreshProfile()} disabled={profileBusy || profile.status === "processing"} className="font-black underline disabled:opacity-50">{profileBusy ? "Queuing…" : "Retry profile"}</button></div>}
      <div className="mt-7 flex flex-wrap items-center gap-2 border-b pb-3"><div className="flex gap-1 overflow-x-auto">{([ ["all", "All jobs"], ["best", "Best matches"], ["remote", "Remote jobs"], ["saved", "Saved jobs"]] as [Tab, string][]).map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-extrabold transition ${tab === value ? "bg-ink text-canvas" : "text-muted hover:bg-panel"}`}>{label}{value === "saved" && Object.keys(saved).length > 0 ? ` · ${Object.keys(saved).length}` : ""}</button>)}</div><button onClick={() => setFiltersOpen((value) => !value)} className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg border bg-panel px-3 text-sm font-extrabold lg:hidden"><Filter className="size-4"/> Filters</button></div>
      <div className="mt-5 grid gap-6 lg:grid-cols-[250px_1fr]">
        <aside className={`${filtersOpen ? "block" : "hidden"} rounded-2xl border bg-panel p-5 lg:block`}><div className="flex items-center justify-between"><h2 className="font-black">Refine results</h2><Filter className="size-4 text-accent"/></div><div className="mt-5 space-y-4"><label className="block"><span className="text-xs font-black uppercase tracking-wider text-muted">Search within results</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} className="mt-2 h-10 w-full rounded-lg border bg-canvas px-3 text-sm outline-none" placeholder="Company, title…"/></label><label className="block"><span className="text-xs font-black uppercase tracking-wider text-muted">Skill</span><input value={skillFilter} onChange={(event) => setSkillFilter(event.target.value)} className="mt-2 h-10 w-full rounded-lg border bg-canvas px-3 text-sm outline-none" placeholder="Python, Figma…"/></label><label className="block"><span className="text-xs font-black uppercase tracking-wider text-muted">Arrangement</span><select value={arrangement} onChange={(event) => setArrangement(event.target.value)} className="mt-2 h-10 w-full rounded-lg border bg-canvas px-3 text-sm"><option value="">Any arrangement</option>{arrangementOptions.map((item) => <option key={item}>{item}</option>)}</select></label><label className="block"><span className="text-xs font-black uppercase tracking-wider text-muted">Experience</span><select value={experience} onChange={(event) => setExperience(event.target.value)} className="mt-2 h-10 w-full rounded-lg border bg-canvas px-3 text-sm"><option value="">Any level</option>{experienceOptions.map((item) => <option key={item}>{item}</option>)}</select></label><label className="block"><span className="text-xs font-black uppercase tracking-wider text-muted">Posted within</span><select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="mt-2 h-10 w-full rounded-lg border bg-canvas px-3 text-sm"><option value="any">Any date</option><option value="24h">24 hours</option><option value="3d">3 days</option><option value="7d">7 days</option><option value="30d">30 days</option></select></label><button type="button" onClick={() => { setKeyword(""); setSkillFilter(""); setDateFilter("any"); setArrangement(preferences?.work_arrangements[0] || ""); setExperience(preferences?.experience_levels[0] || ""); }} className="text-sm font-extrabold text-accent">Reset filters</button></div></aside>
        <main>{statusBusy && <div className="mb-5 flex items-center gap-3 rounded-2xl border bg-panel p-5 text-sm font-semibold text-muted"><LoaderCircle className="size-5 animate-spin text-accent"/> Searching permitted sources and comparing your CV evidence. No progress percentage is invented.</div>}{search?.status === "failed" && <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm font-semibold text-amber-800">{search.provider_status === "unconfigured" ? "No approved job source is configured in this environment. Add Greenhouse board tokens or Lever site names on the server to retrieve live openings." : search.provider_status === "timeout" ? "The search exceeded its time limit. Retry after checking provider availability." : "The provider search failed. Retry after checking the source configuration."}</div>}{search?.status === "partial" && <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm font-semibold text-amber-800">Some approved job sources were unavailable. These are verified results from the sources that responded.</div>}{!statusBusy && visibleMatches.length > 0 ? <div className="space-y-4">{visibleMatches.map((match) => <JobCard key={match.id} match={match} saved={Boolean(saved[match.listing.id])} onSave={() => void toggleSaved(match)} onDetails={() => setDetails(match)}/>)}</div> : !statusBusy && <div className="rounded-2xl border bg-panel p-10 text-center"><BriefcaseBusiness className="mx-auto size-8 text-accent"/><h2 className="mt-4 text-xl font-black">{search?.status === "failed" ? "Live results are unavailable." : search?.status === "cancelled" ? "Search stopped." : search?.status === "succeeded" && search.provider_status === "empty" ? "No matching jobs found." : search ? "No verified matches yet." : "Your next opportunity starts with a search."}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">{search?.status === "cancelled" ? "You stopped this search before results were returned. Start a new search whenever you are ready." : search?.status === "succeeded" && search.provider_status === "empty" ? "The configured sources responded, but none of their current openings matched your reviewed CV and preferences." : search ? "Try a different role, location, or filter. Unknown provider fields remain unknown rather than being guessed." : "Search approved job feeds using your processed CV and preferences. CareerPilot will keep the evidence behind every match visible."}</p></div>}</main>
      </div>
    </>}
    {preferencesOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-[#050a12]/70 p-4" role="dialog" aria-modal="true" aria-labelledby="preferences-title"><form onSubmit={savePreferenceChanges} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border bg-panel p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-accent">Personalization</p><h2 id="preferences-title" className="mt-2 text-2xl font-black">Job preferences</h2></div><button type="button" onClick={() => setPreferencesOpen(false)} aria-label="Close preferences"><X className="size-5"/></button></div><div className="mt-6 space-y-4"><label className="block"><span className="text-sm font-extrabold">Preferred roles</span><input value={roles} onChange={(event) => setRoles(event.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-canvas px-3 text-sm" placeholder="Separate roles with commas"/></label><label className="block"><span className="text-sm font-extrabold">Locations</span><input value={locations} onChange={(event) => setLocations(event.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-canvas px-3 text-sm" placeholder="Remote, Karachi, London"/></label><div className="grid gap-4 sm:grid-cols-2"><label><span className="text-sm font-extrabold">Arrangement</span><select value={arrangement} onChange={(event) => setArrangement(event.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-canvas px-3 text-sm"><option value="">Any arrangement</option>{arrangementOptions.map((item) => <option key={item}>{item}</option>)}</select></label><label><span className="text-sm font-extrabold">Experience level</span><select value={experience} onChange={(event) => setExperience(event.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-canvas px-3 text-sm"><option value="">Any level</option>{experienceOptions.map((item) => <option key={item}>{item}</option>)}</select></label></div><div className="grid gap-4 sm:grid-cols-2"><label><span className="text-sm font-extrabold">Minimum salary</span><input type="number" min="0" value={salaryMinimum} onChange={(event) => setSalaryMinimum(event.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-canvas px-3 text-sm" placeholder="Optional"/></label><label><span className="text-sm font-extrabold">Currency</span><input value={salaryCurrency} onChange={(event) => setSalaryCurrency(event.target.value.toUpperCase())} className="mt-2 h-11 w-full rounded-xl border bg-canvas px-3 text-sm" maxLength={3}/></label></div></div><div className="mt-7 flex justify-end gap-2"><button type="button" onClick={() => setPreferencesOpen(false)} className="h-11 rounded-xl border px-4 text-sm font-extrabold">Cancel</button><button className="h-11 rounded-xl bg-accent px-5 text-sm font-black text-[#06151a]">Save preferences</button></div></form></div>}
    {profileOpen && profile?.profile && <ProfileEditor profile={profile.profile} onClose={() => setProfileOpen(false)} onSave={(nextProfile) => void saveProfileChanges(nextProfile)}/>}
    {details && <DetailsDrawer match={details} saved={Boolean(saved[details.listing.id])} onSave={() => void toggleSaved(details)} onClose={() => setDetails(null)}/>}
  </div>;
}

function ProfileEditor({ profile, onClose, onSave }: { profile: ProfessionalProfile; onClose: () => void; onSave: (profile: ProfessionalProfile) => void }) {
  const existingSkills = profile.skills.map((skill) => skill.name);
  const [rolesValue, setRolesValue] = useState(profile.roles.map((role) => role.title).join(", "));
  const [skillsValue, setSkillsValue] = useState(existingSkills.join(", "));
  function submit(event: FormEvent) {
    event.preventDefault();
    const skillNames = csv(skillsValue);
    const skills = skillNames.map((name) => profile.skills.find((item) => item.name.toLowerCase() === name.toLowerCase()) ?? {
      name,
      normalized_name: name.toLowerCase(),
      category: "other",
      assertion: "uncertain" as const,
      evidence: [],
    });
    const roles = csv(rolesValue).map((title) => profile.roles.find((role) => role.title.toLowerCase() === title.toLowerCase()) ?? {
      title,
      rationale: "User-confirmed role interest; supporting CV evidence should be reviewed before applying.",
      confidence: 0.5,
      evidence: [],
    });
    onSave({ ...profile, skills, roles });
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#050a12]/70 p-4" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title"><form onSubmit={submit} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border bg-panel p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wider text-accent">Evidence review</p><h2 id="profile-editor-title" className="mt-2 text-2xl font-black">Review your CV profile</h2><p className="mt-2 text-sm leading-6 text-muted">Edit extracted role paths and skills. New entries are marked uncertain until supported by CV evidence.</p></div><button type="button" onClick={onClose} aria-label="Close profile editor"><X className="size-5"/></button></div><label className="mt-7 block"><span className="text-sm font-extrabold">Supported role paths and interests</span><input value={rolesValue} onChange={(event) => setRolesValue(event.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-canvas px-3 text-sm" placeholder="Separate roles with commas"/></label><label className="mt-5 block"><span className="text-sm font-extrabold">Extracted skills</span><input value={skillsValue} onChange={(event) => setSkillsValue(event.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-canvas px-3 text-sm" placeholder="Separate skills with commas"/></label><div className="mt-6 rounded-2xl border bg-canvas/40 p-4"><p className="text-xs font-black uppercase tracking-wider text-muted">Current evidence</p><div className="mt-3 space-y-3">{profile.skills.slice(0, 8).map((skill) => <div key={`${skill.name}-${skill.normalized_name}`}><div className="flex flex-wrap items-center gap-2"><span className="font-bold">{skill.name}</span><span className="rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-accent">{skill.assertion}</span></div>{skill.evidence[0] && <p className="mt-1 text-xs leading-5 text-muted">“{skill.evidence[0].quote}” · {skill.evidence[0].section}</p>}</div>)}</div></div><div className="mt-7 flex justify-end gap-2"><button type="button" onClick={onClose} className="h-11 rounded-xl border px-4 text-sm font-extrabold">Cancel</button><button className="h-11 rounded-xl bg-accent px-5 text-sm font-black text-[#06151a]">Save reviewed profile</button></div></form></div>;
}

function JobCard({ match, saved, onSave, onDetails }: { match: JobMatch; saved: boolean; onSave: () => void; onDetails: () => void }) {
  const job = match.listing;
  return <article className="group rounded-2xl border bg-panel p-5 transition hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-lg sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div className="flex min-w-0 gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-panel-elevated text-sm font-black text-accent">{monogram(job.company_name)}</span><div className="min-w-0"><h2 className="truncate text-lg font-black sm:text-xl">{job.title}</h2><p className="mt-1 truncate text-sm font-bold text-muted">{job.company_name}</p><div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-muted">{job.location && <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1"><MapPin className="size-3"/>{job.location}</span>}{job.work_arrangement && <span className="rounded-full border px-2.5 py-1">{job.work_arrangement}</span>}{job.experience_level && <span className="rounded-full border px-2.5 py-1">{job.experience_level}</span>}</div></div></div><div className="flex items-start gap-2"><div className="rounded-xl bg-accent/10 px-3 py-2 text-right"><p className="text-lg font-black text-accent">{match.score}<span className="text-xs">/100</span></p><p className="text-[10px] font-black uppercase tracking-wider text-accent">{matchLabel(match.score)}</p></div><button onClick={onSave} aria-label={saved ? "Remove saved job" : "Save job"} className={`grid size-10 place-items-center rounded-xl border transition ${saved ? "border-accent bg-accent/10 text-accent" : "hover:border-accent"}`}>{saved ? <Check className="size-4"/> : <Bookmark className="size-4"/>}</button></div></div><p className="mt-5 line-clamp-3 text-sm leading-6 text-muted">{job.description}</p>{match.matched_skills.length > 0 && <div className="mt-5 flex flex-wrap gap-2"><span className="text-xs font-black uppercase tracking-wider text-muted">CV evidence</span>{match.matched_skills.slice(0, 6).map((skill) => <span key={skill} className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent">{skill}</span>)}</div>}{match.missing_required_skills.length > 0 && <p className="mt-4 text-xs font-semibold text-amber-700">Unverified requirements: {match.missing_required_skills.slice(0, 4).join(", ")}</p>}<div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs font-semibold text-muted"><span><Clock3 className="mr-1 inline size-3"/>{dateLabel(job.published_at)} · {salaryLabel(job)}</span><span>{job.source.display_name} · verified {dateLabel(job.last_verified_at)}</span></div><div className="mt-4 flex flex-wrap gap-2"><button onClick={onDetails} className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-extrabold text-canvas">Why this matches <ChevronDown className="size-4"/></button><a href={job.canonical_url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-extrabold">Apply on source <ArrowUpRight className="size-4"/></a></div></article>;
}

function DetailsDrawer({ match, saved, onSave, onClose }: { match: JobMatch; saved: boolean; onSave: () => void; onClose: () => void }) {
  const job = match.listing;
  return <div className="fixed inset-0 z-50 bg-[#050a12]/70" role="dialog" aria-modal="true" aria-labelledby="job-details-title"><button onClick={onClose} className="absolute inset-0 cursor-default" aria-label="Close job details"/><aside className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l bg-panel p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wider text-accent">{job.source.display_name}</p><h2 id="job-details-title" className="mt-2 text-2xl font-black">{job.title}</h2><p className="mt-1 font-bold text-muted">{job.company_name} · {job.location || "Location not provided"}</p></div><button onClick={onClose} aria-label="Close"><X className="size-5"/></button></div><div className="mt-6 rounded-2xl bg-accent/10 p-5"><div className="flex items-center gap-3"><CheckCircle2 className="size-5 text-accent"/><p className="font-black text-accent">{matchLabel(match.score)} · {match.score}/100</p></div><p className="mt-2 text-xs leading-5 text-muted">A transparent job-relevance indicator based on available CV evidence and listing requirements, not a hiring prediction.</p></div><div className="mt-7 flex flex-wrap gap-2"><button onClick={onSave} className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-extrabold">{saved ? <Check className="size-4 text-accent"/> : <Bookmark className="size-4"/>}{saved ? "Saved" : "Save job"}</button><a href={job.canonical_url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-extrabold text-canvas">Apply on source <ArrowUpRight className="size-4"/></a></div><section className="mt-8"><h3 className="text-sm font-black uppercase tracking-wider text-muted">Why this job matches</h3>{match.matched_skills.length ? <p className="mt-3 text-sm leading-6">Your selected CV contains evidence related to <span className="font-bold text-accent">{match.matched_skills.join(", ")}</span>.</p> : <p className="mt-3 text-sm leading-6 text-muted">No direct skill evidence was found in the selected CV. Unknown is not treated as a confirmed gap.</p>}{match.missing_required_skills.length > 0 && <p className="mt-3 text-sm leading-6 text-amber-700">Potential gaps to verify: {match.missing_required_skills.join(", ")}. These are requirements not supported by the available CV evidence.</p>}</section><section className="mt-8"><h3 className="text-sm font-black uppercase tracking-wider text-muted">Job description</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted">{job.description}</p></section><section className="mt-8 grid gap-3 border-t pt-5 text-sm"><p><span className="font-black">Salary:</span> {salaryLabel(job)}</p><p><span className="font-black">Posted:</span> {dateLabel(job.published_at)}</p><p><span className="font-black">Last verified:</span> {dateLabel(job.last_verified_at)}</p><p><span className="font-black">Source:</span> {job.source.display_name} · <a className="font-bold text-accent" href={job.source.terms_url} target="_blank" rel="noreferrer">terms</a></p></section><button disabled className="mt-7 h-11 w-full rounded-xl border text-sm font-extrabold text-muted">Practice interview · Coming soon</button></aside></div>;
}
