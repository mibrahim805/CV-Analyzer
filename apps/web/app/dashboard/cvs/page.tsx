"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, FileText, Filter, MoreHorizontal, Search, Sparkles, Trash2, UploadCloud, X } from "lucide-react";
import Link from "next/link";
import { useCurrentUser } from "@/components/app-shell";
import { CVUploadDialog } from "@/components/cv-library/cv-upload-dialog";
import { AnalysisBadge, CVStatusBadge, cvState } from "@/components/cv-library/cv-status-badge";
import { analyzeCV, cvDownloadUrl, deleteCV, getCVExtraction, getCVVersion, listCVDocuments, type CVAnalysis, type CVDocument, type CVExtractionStatus, type CVVersion } from "@/lib/cv-api";

type CVRecord = { document: CVDocument; version: CVVersion | null; extraction: CVExtractionStatus | null };
type Filter = "all" | "ready" | "processing" | "analyzed" | "failed";
type Sort = "newest" | "oldest" | "filename";

function formatDate(value?: string) { return value ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "—"; }
function formatBytes(bytes?: number) { if (!bytes) return "—"; const units = ["B", "KB", "MB", "GB"]; let amount = bytes; let index = 0; while (amount >= 1024 && index < units.length - 1) { amount /= 1024; index += 1; } return `${amount >= 10 || index === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[index]}`; }
function formatType(version: CVVersion) { return version.media_type.includes("pdf") ? "PDF" : "DOCX"; }
function statusCopy(status?: string | null) { const value = (status ?? "").replaceAll("_", " "); return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Unknown"; }

export default function CVLibraryPage() {
  const { user, loading: userLoading } = useCurrentUser();
  const [records, setRecords] = useState<CVRecord[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, CVAnalysis>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selected, setSelected] = useState<CVRecord | null>(null);
  const [report, setReport] = useState<CVAnalysis | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CVRecord | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!user) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const documents = await listCVDocuments(signal);
      const next = await Promise.all(documents.map(async (document) => {
        if (!document.active_version_id) return { document, version: null, extraction: null };
        const [version, extraction] = await Promise.all([
          getCVVersion(document.id, document.active_version_id, signal),
          getCVExtraction(document.id, document.active_version_id, signal),
        ]);
        return { document, version, extraction };
      }));
      setRecords(next);
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "Your CV library could not be loaded.");
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((record) => {
      const matchesSearch = !query || record.version?.original_name.toLowerCase().includes(query);
      const state = cvState(record.version?.status);
      const matchesFilter = filter === "all" || (filter === "analyzed" ? Boolean(record.version && analyses[record.version.id]) : filter === state);
      return matchesSearch && matchesFilter;
    }).sort((a, b) => {
      if (sort === "filename") return (a.version?.original_name ?? a.document.label).localeCompare(b.version?.original_name ?? b.document.label);
      const aDate = new Date(a.version?.created_at ?? a.document.created_at).getTime();
      const bDate = new Date(b.version?.created_at ?? b.document.created_at).getTime();
      return sort === "newest" ? bDate - aDate : aDate - bDate;
    });
  }, [analyses, filter, records, search, sort]);

  const total = records.length;
  const ready = records.filter((record) => cvState(record.version?.status) === "ready" && !(record.version && analyses[record.version.id])).length;
  const analyzed = records.filter((record) => Boolean(record.version && analyses[record.version.id])).length;

  async function handleAnalyze(record: CVRecord) {
    if (!record.version || cvState(record.version.status) !== "ready") return;
    setAnalyzingId(record.version.id); setMutationError(null);
    try { const result = await analyzeCV(record.document.id, record.version.id); setAnalyses((current) => ({ ...current, [record.version!.id]: result })); setSelected(record); setReport(result); }
    catch (reason) { setMutationError(reason instanceof Error ? reason.message : "The CV could not be analyzed."); }
    finally { setAnalyzingId(null); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true); setMutationError(null);
    try { await deleteCV(deleteTarget.document.id); setDeleteTarget(null); setSelected(null); if (deleteTarget.version) setAnalyses((current) => { const next = { ...current }; delete next[deleteTarget.version!.id]; return next; }); await load(); }
    catch (reason) { setMutationError(reason instanceof Error ? reason.message : "The CV could not be deleted."); }
    finally { setDeleting(false); }
  }

  if (userLoading || loading) return <LibrarySkeleton />;

  return <div className="mx-auto max-w-[1440px] pb-20">
    <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><p className="text-xs font-black uppercase tracking-[.2em] text-accent">Career workspace</p><h1 className="mt-3 text-3xl font-black tracking-[-.04em] text-ink sm:text-4xl">My CVs</h1><p className="mt-2 max-w-xl text-sm text-muted sm:text-base">Manage your resumes, review their status, and discover opportunities to improve.</p></div><button type="button" onClick={() => setUploadOpen(true)} className="dashboard-focus inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-black text-accent-ink shadow-[0_10px_30px_hsl(var(--accent)/.12)] transition hover:bg-accent/90"><UploadCloud className="size-4" /> Upload New CV</button></div>
    <div className="mt-8 grid gap-3 sm:grid-cols-3"><SummaryCard label="Total CVs" value={total} icon={<FileText className="size-4" />} /><SummaryCard label="Ready for analysis" value={ready} icon={<CheckCircle2 className="size-4" />} tone="accent" /><SummaryCard label="Analyzed CVs" value={analyzed} icon={<Sparkles className="size-4" />} tone="blue" /></div>
    {mutationError && <div role="alert" className="mt-6 flex items-start gap-3 rounded-2xl border border-red-300/30 bg-red-500/10 p-4 text-sm font-semibold text-red-200"><AlertCircle className="mt-0.5 size-4 shrink-0" />{mutationError}<button type="button" className="ml-auto text-red-200/70 hover:text-red-100" onClick={() => setMutationError(null)} aria-label="Dismiss error"><X className="size-4" /></button></div>}
    {error ? <ErrorState message={error} onRetry={() => void load()} /> : <>
      <div className="premium-card mt-8 rounded-2xl border border-line/80 p-3 sm:p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center"><label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><span className="sr-only">Search CVs by filename</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by filename" className="dashboard-focus h-10 w-full rounded-xl border border-line bg-panel-elevated/60 pl-10 pr-3 text-sm font-semibold text-ink outline-none placeholder:text-muted/70" /></label><div className="flex flex-wrap items-center gap-2"><Filter className="size-4 text-muted" aria-hidden="true" /><select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} className="dashboard-focus h-10 rounded-xl border border-line bg-panel-elevated px-3 text-xs font-black text-ink"><option value="all">All CVs</option><option value="ready">Ready</option><option value="processing">Processing</option><option value="analyzed">Analyzed</option><option value="failed">Failed</option></select><select value={sort} onChange={(event) => setSort(event.target.value as Sort)} className="dashboard-focus h-10 rounded-xl border border-line bg-panel-elevated px-3 text-xs font-black text-ink"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="filename">Filename</option></select></div></div></div>
      {records.length === 0 ? <EmptyState onUpload={() => setUploadOpen(true)} /> : visible.length === 0 ? <NoResults onClear={() => { setSearch(""); setFilter("all"); }} /> : <section className="mt-6 space-y-3" aria-label="CV library">{visible.map((record) => <CVListItem key={record.document.id} record={record} analysis={record.version ? analyses[record.version.id] : undefined} analyzing={record.version?.id === analyzingId} onAnalyze={() => void handleAnalyze(record)} onDetails={() => { setSelected(record); setReport(record.version ? analyses[record.version.id] ?? null : null); }} onDelete={() => setDeleteTarget(record)} />)}</section>}
    </>}
    <CVUploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={() => { void load(); }} />
    {selected && <DetailsDialog record={selected} analysis={report} onClose={() => { setSelected(null); setReport(null); }} onAnalyze={() => void handleAnalyze(selected)} analyzing={selected.version?.id === analyzingId} />}
    {deleteTarget && <DeleteDialog record={deleteTarget} deleting={deleting} onCancel={() => setDeleteTarget(null)} onConfirm={() => void handleDelete()} />}
  </div>;
}

function SummaryCard({ label, value, icon, tone = "default" }: { label: string; value: number; icon: ReactNode; tone?: "default" | "accent" | "blue" }) { return <div className="premium-card flex items-center gap-3 rounded-2xl border border-line/80 p-4"><span className={`grid size-10 place-items-center rounded-xl ${tone === "accent" ? "bg-accent/10 text-accent" : tone === "blue" ? "bg-blue/10 text-blue" : "bg-panel-elevated text-muted"}`}>{icon}</span><div><p className="text-2xl font-black tracking-[-.03em] text-ink">{value}</p><p className="mt-0.5 text-xs font-bold text-muted">{label}</p></div></div>; }

function CVListItem({ record, analysis, analyzing, onAnalyze, onDetails, onDelete }: { record: CVRecord; analysis?: CVAnalysis; analyzing: boolean; onAnalyze: () => void; onDetails: () => void; onDelete: () => void }) {
  const version = record.version;
  const [menuOpen, setMenuOpen] = useState(false);
  const canOpen = Boolean(version && ["clean", "extracting", "needs_ocr", "ready", "extraction_failed"].includes(version.status));
  return <article className="premium-card rounded-2xl border border-line/80 p-4 transition-colors hover:border-accent/30 sm:p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-center"><div className="flex min-w-0 flex-1 items-center gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent/10 text-accent"><FileText className="size-6" /></span><div className="min-w-0">{canOpen ? <a href={cvDownloadUrl(record.document.id, version!.id)} target="_blank" rel="noreferrer" className="dashboard-focus block truncate text-sm font-black text-ink hover:text-accent" title={`Open ${version?.original_name}`}>{version?.original_name ?? record.document.label}</a> : <h2 className="truncate text-sm font-black text-ink" title={version?.original_name ?? record.document.label}>{version?.original_name ?? record.document.label}</h2>}<p className="mt-1 text-xs text-muted">Uploaded {formatDate(version?.created_at ?? record.document.created_at)} <span className="mx-1 text-line">•</span> {version ? `${formatType(version)} · ${formatBytes(version.byte_size)}` : "No active version"}</p></div></div><div className="flex flex-wrap items-center gap-2 xl:justify-end"><CVStatusBadge status={version?.status} /><AnalysisBadge analyzed={Boolean(analysis)} /><div className="ml-auto flex items-center gap-2 xl:ml-2"><button type="button" onClick={onDetails} className="dashboard-focus rounded-xl border border-line px-3 py-2 text-xs font-black text-muted transition hover:border-accent/50 hover:text-ink">View details</button>{version && cvState(version.status) === "ready" && !analysis && <button type="button" onClick={onAnalyze} disabled={analyzing} className="dashboard-focus inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-black text-accent-ink transition hover:bg-accent/90 disabled:opacity-50">{analyzing ? <span className="size-3 animate-spin rounded-full border-2 border-accent-ink/40 border-t-accent-ink" /> : <Sparkles className="size-3.5" />}{analyzing ? "Analyzing" : "Analyze CV"}</button>}{analysis && <Link href={`/dashboard/cvs/${record.document.id}/analysis?versionId=${version?.id ?? ""}`} className="dashboard-focus rounded-xl border border-blue/30 bg-blue/10 px-3 py-2 text-xs font-black text-blue">View report</Link>}<div className="relative"><button type="button" onClick={() => setMenuOpen((open) => !open)} className="dashboard-focus grid size-9 place-items-center rounded-xl border border-line text-muted hover:border-accent/50 hover:text-ink" aria-label="More CV actions" aria-expanded={menuOpen}><MoreHorizontal className="size-4" /></button>{menuOpen && <div className="absolute right-0 top-11 z-20 w-40 rounded-xl border border-line bg-panel-elevated p-1.5 shadow-2xl" role="menu"><button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onDetails(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-ink hover:bg-panel"><FileText className="size-3.5" /> View details</button>{canOpen && <a href={cvDownloadUrl(record.document.id, version!.id)} target="_blank" rel="noreferrer" role="menuitem" onClick={() => setMenuOpen(false)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-ink hover:bg-panel"><FileText className="size-3.5" /> Open original</a>}<button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onDelete(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-red-200 hover:bg-red-500/10"><Trash2 className="size-3.5" /> Delete CV</button></div>}</div></div></div></div></article>;
}

function DetailsDialog({ record, analysis, onClose, onAnalyze, analyzing }: { record: CVRecord; analysis: CVAnalysis | null; onClose: () => void; onAnalyze: () => void; analyzing: boolean }) { const version = record.version; const canOpen = Boolean(version && ["clean", "extracting", "needs_ocr", "ready", "extraction_failed"].includes(version.status)); return <div className="fixed inset-0 z-[65] overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="cv-details-title" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}><div className="mx-auto mt-8 max-w-2xl premium-card rounded-3xl border border-line/90 p-5 shadow-2xl sm:mt-16 sm:p-7"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs font-black uppercase tracking-[.2em] text-accent">CV details</p><h2 id="cv-details-title" className="mt-2 truncate text-2xl font-black tracking-[-.03em] text-ink">{version?.original_name ?? record.document.label}</h2></div><button type="button" onClick={onClose} className="dashboard-focus grid size-10 place-items-center rounded-xl text-muted hover:bg-panel-elevated hover:text-ink" aria-label="Close CV details"><X className="size-5" /></button></div><div className="mt-6 grid gap-3 sm:grid-cols-2"><Detail label="Uploaded" value={formatDate(version?.created_at ?? record.document.created_at)} /><Detail label="Format" value={version ? formatType(version) : "—"} /><Detail label="File size" value={version ? formatBytes(version.byte_size) : "—"} /><Detail label="Processing" value={statusCopy(version?.status)} /><Detail label="Extraction" value={record.extraction?.extraction ? `${record.extraction.extraction.character_count.toLocaleString()} characters` : "Not available"} /><Detail label="Extraction method" value={record.extraction?.extraction?.method ?? "—"} /></div>{version && cvState(version.status) === "failed" && <p className="mt-5 rounded-xl border border-red-300/30 bg-red-500/10 p-3 text-sm font-semibold text-red-200">This CV could not finish processing{version.failure_code ? ` (${version.failure_code})` : ""}. Please upload a corrected file or try again later.</p>}{canOpen && <a href={cvDownloadUrl(record.document.id, version!.id)} target="_blank" rel="noreferrer" className="dashboard-focus mt-6 inline-flex rounded-xl border border-blue/30 bg-blue/10 px-4 py-2.5 text-sm font-black text-blue hover:bg-blue/15">Open original CV</a>}{version && !canOpen && <p className="mt-5 text-xs font-semibold text-muted">The original will be available after security processing completes.</p>}{version && cvState(version.status) === "ready" && !analysis && <button type="button" onClick={onAnalyze} disabled={analyzing} className="dashboard-focus mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-black text-accent-ink disabled:opacity-50">{analyzing ? "Analyzing…" : "Analyze CV"}</button>}{analysis && <><Report analysis={analysis} />{version && <Link href={`/dashboard/cvs/${record.document.id}/analysis?versionId=${version.id}`} onClick={onClose} className="dashboard-focus mt-5 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-black text-accent-ink hover:bg-accent/90">Open full analysis</Link>}</>}</div></div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-line/70 bg-panel-elevated/45 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-muted">{label}</p><p className="mt-1 text-sm font-bold text-ink">{value}</p></div>; }
function Report({ analysis }: { analysis: CVAnalysis }) { return <div className="mt-7 border-t border-line/70 pt-6"><div className="flex items-center gap-2"><Sparkles className="size-4 text-accent" /><h3 className="text-base font-black text-ink">Analysis report</h3><span className="ml-auto text-xs font-bold text-muted">{formatDate(analysis.generated_at)}</span></div><div className="mt-4 grid gap-2 sm:grid-cols-3">{Object.entries(analysis.metrics).map(([key, value]) => <div key={key} className="rounded-xl border border-line/70 bg-panel-elevated/45 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-muted">{key.replaceAll("_", " ")}</p><p className="mt-1 text-xl font-black text-ink">{value}</p></div>)}</div>{analysis.recommendations.length > 0 && <div className="mt-5"><p className="text-xs font-black uppercase tracking-wider text-muted">Recommendations</p><ul className="mt-2 space-y-2">{analysis.recommendations.map((recommendation) => <li key={recommendation} className="flex gap-2 text-sm text-muted"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />{recommendation}</li>)}</ul></div>}</div>; }
function DeleteDialog({ record, deleting, onCancel, onConfirm }: { record: CVRecord; deleting: boolean; onCancel: () => void; onConfirm: () => void }) { return <div className="fixed inset-0 z-[75] grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-cv-title" onKeyDown={(event) => { if (event.key === "Escape" && !deleting) onCancel(); }}><div className="premium-card w-full max-w-md rounded-3xl border border-line/90 p-6 shadow-2xl"><div className="grid size-12 place-items-center rounded-2xl bg-red-500/10 text-red-200"><Trash2 className="size-5" /></div><h2 id="delete-cv-title" className="mt-5 text-xl font-black text-ink">Delete this CV?</h2><p className="mt-2 text-sm leading-6 text-muted">This removes <span className="font-bold text-ink">{record.version?.original_name ?? record.document.label}</span> from your library. Related analysis data may also be removed according to the retention policy.</p><div className="mt-7 flex justify-end gap-3"><button type="button" onClick={onCancel} disabled={deleting} className="dashboard-focus rounded-xl px-4 py-2.5 text-sm font-black text-muted hover:bg-panel-elevated hover:text-ink">Cancel</button><button type="button" onClick={onConfirm} disabled={deleting} className="dashboard-focus inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-black text-white hover:bg-red-400 disabled:opacity-50">{deleting ? "Deleting…" : "Delete CV"}</button></div></div></div>; }
function EmptyState({ onUpload }: { onUpload: () => void }) { return <div className="premium-card mt-6 rounded-3xl border border-line/80 p-10 text-center sm:p-16"><span className="mx-auto grid size-16 place-items-center rounded-3xl bg-accent/10 text-accent"><FileText className="size-8" /></span><h2 className="mt-6 text-2xl font-black tracking-[-.03em] text-ink">Your career journey starts with a CV.</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">Upload your first resume to unlock personalized career insights.</p><button type="button" onClick={onUpload} className="dashboard-focus mt-7 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-black text-accent-ink hover:bg-accent/90"><UploadCloud className="size-4" /> Upload Your First CV</button></div>; }
function NoResults({ onClear }: { onClear: () => void }) { return <div className="premium-card mt-6 rounded-3xl border border-line/80 p-10 text-center"><Search className="mx-auto size-8 text-muted" /><h2 className="mt-4 text-xl font-black text-ink">No CVs match those filters</h2><p className="mt-2 text-sm text-muted">Try a different filename or clear the current filters.</p><button type="button" onClick={onClear} className="dashboard-focus mt-5 rounded-xl border border-line px-4 py-2.5 text-sm font-black text-ink hover:border-accent/50">Clear filters</button></div>; }
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="premium-card mt-8 rounded-3xl border border-red-300/25 bg-red-500/[.05] p-8 text-center"><AlertCircle className="mx-auto size-8 text-red-200" /><h2 className="mt-4 text-xl font-black text-ink">We could not load your CVs</h2><p className="mx-auto mt-2 max-w-lg text-sm text-muted">{message}</p><button type="button" onClick={onRetry} className="dashboard-focus mt-5 rounded-xl bg-panel-elevated px-4 py-2.5 text-sm font-black text-ink hover:border-accent/50">Try again</button></div>; }
function LibrarySkeleton() { return <div className="mx-auto max-w-[1440px] animate-pulse pb-20"><div className="h-3 w-28 rounded bg-panel-elevated" /><div className="mt-4 h-10 w-52 rounded bg-panel-elevated" /><div className="mt-3 h-5 w-96 max-w-full rounded bg-panel-elevated" /><div className="mt-8 grid gap-3 sm:grid-cols-3"><div className="h-20 rounded-2xl bg-panel" /><div className="h-20 rounded-2xl bg-panel" /><div className="h-20 rounded-2xl bg-panel" /></div><div className="mt-8 h-16 rounded-2xl bg-panel" /><div className="mt-6 space-y-3"><div className="h-28 rounded-2xl bg-panel" /><div className="h-28 rounded-2xl bg-panel" /></div></div>; }
