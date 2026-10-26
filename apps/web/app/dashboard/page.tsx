"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  FileSearch,
  FileUp,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";
import { useCurrentUser } from "@/components/app-shell";
import { apiBaseUrl, csrfToken } from "@/lib/api";
import { cvDownloadUrl } from "@/lib/cv-api";

const MAX_CV_BYTES = 10 * 1024 * 1024;
const MEDIA_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

type UploadState = "idle" | "hashing" | "uploading" | "scanning" | "success";
type HeroState = "empty" | "ready" | "processing" | "complete" | "failed";

type CVAnalysis = {
  analysis_type: string;
  metrics: Record<string, number>;
  checks: Array<{ key: string; status: string; detail: string; evidence: string }>;
  recommendations: string[];
};

type UploadInitiateResponse = {
  document: { id: string };
  version: { id: string };
  upload: { url: string; method?: string; headers: Record<string, string> };
};

export default function DashboardPage() {
  const { user, loading: userLoading } = useCurrentUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [extractionStatus, setExtractionStatus] = useState<string | null>(null);
  const [uploadedDocumentId, setUploadedDocumentId] = useState<string | null>(null);
  const [uploadedVersionId, setUploadedVersionId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<CVAnalysis | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cvLoading, setCvLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const displayName = user?.profile.display_name?.trim() || user?.email.split("@")[0] || "there";
  const isUploading = uploadState === "hashing" || uploadState === "uploading" || uploadState === "scanning";
  const heroState = deriveHeroState({ cvLoading, uploadedFile, extractionStatus, uploadState, analysis });
  const canOpenCv = Boolean(uploadedDocumentId && uploadedVersionId && ["clean", "extracting", "needs_ocr", "ready", "extraction_failed"].includes(extractionStatus ?? ""));

  useEffect(() => {
    if (!user) {
      setCvLoading(false);
      return;
    }
    const controller = new AbortController();
    setCvLoading(true);
    setLoadError(null);
    loadLatestCv(controller.signal)
      .then((latest) => {
        if (!latest) return;
        setUploadedFile(latest.filename);
        setUploadedDocumentId(latest.documentId);
        setUploadedVersionId(latest.versionId);
        setExtractionStatus(latest.status);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLoadError(error instanceof Error ? error.message : "We could not load your CV status.");
        }
      })
      .finally(() => setCvLoading(false));
    return () => controller.abort();
  }, [user, refreshKey]);

  function openFilePicker() {
    if (!isUploading) fileInputRef.current?.click();
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploadError(null);
    setAnalysisError(null);
    setUploadedFile(null);
    setExtractionStatus(null);
    setUploadedDocumentId(null);
    setUploadedVersionId(null);
    setAnalysis(null);

    const extension = file.name.split(".").pop()?.toLowerCase();
    const mediaType = extension ? MEDIA_TYPES[extension] : undefined;
    if (!mediaType) {
      setUploadError("Choose a PDF or DOCX file.");
      return;
    }
    if (file.size === 0) {
      setUploadError("That file is empty. Choose a CV with content.");
      return;
    }
    if (file.size > MAX_CV_BYTES) {
      setUploadError("CV files must be 10 MB or smaller.");
      return;
    }
    const token = csrfToken();
    if (!token) {
      setUploadError("Your session security token is missing. Refresh the page and try again.");
      return;
    }

    try {
      setUploadState("hashing");
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      setUploadState("uploading");
      const initiateResponse = await fetch(`${apiBaseUrl()}/cv-documents/uploads`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
        body: JSON.stringify({ filename: file.name, media_type: mediaType, byte_size: file.size, sha256 }),
      });
      const initiate = await parseResponse<UploadInitiateResponse>(initiateResponse, "The CV could not be uploaded.");
      const objectResponse = await fetch(initiate.upload.url, { method: initiate.upload.method ?? "PUT", headers: initiate.upload.headers, body: file });
      if (!objectResponse.ok) throw new Error("The file could not be transferred to secure storage.");

      setUploadState("scanning");
      const completeResponse = await fetch(`${apiBaseUrl()}/cv-documents/${initiate.document.id}/versions/${initiate.version.id}/complete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
        body: JSON.stringify({ byte_size: file.size, sha256 }),
      });
      await parseResponse(completeResponse, "The CV upload could not be finalized.");
      const finalExtractionStatus = await waitForExtraction(initiate.document.id, initiate.version.id, token);
      setExtractionStatus(finalExtractionStatus);
      setUploadedFile(file.name);
      setUploadedDocumentId(initiate.document.id);
      setUploadedVersionId(initiate.version.id);
      setUploadState("success");
      if (["rejected", "scan_failed", "extraction_failed"].includes(finalExtractionStatus)) {
        setUploadError("The CV was uploaded, but processing needs attention.");
      }
    } catch (error) {
      setUploadState("idle");
      setUploadError(error instanceof Error ? error.message : "The CV could not be uploaded. Please try again.");
    }
  }

  async function analyzeCv() {
    if (!uploadedDocumentId || !uploadedVersionId) return;
    const token = csrfToken();
    if (!token) {
      setAnalysisError("Your session security token is missing. Refresh the page and try again.");
      return;
    }
    try {
      setAnalyzing(true);
      setAnalysisError(null);
      const response = await fetch(`${apiBaseUrl()}/cv-documents/${uploadedDocumentId}/versions/${uploadedVersionId}/analyze`, {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": token },
      });
      setAnalysis(await parseResponse<CVAnalysis>(response, "The CV could not be analyzed."));
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "The CV could not be analyzed.");
    } finally {
      setAnalyzing(false);
    }
  }

  if (userLoading || cvLoading) return <DashboardSkeleton />;

  return (
    <div className="mx-auto max-w-[1440px] pb-20">
      <input ref={fileInputRef} className="sr-only" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFileSelected} disabled={isUploading} aria-label="Choose a PDF or DOCX CV" />
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[.2em] text-accent">Career workspace</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-.04em] text-ink sm:text-4xl">{getGreeting()}, {displayName}</h1>
          <p className="mt-2 text-sm text-muted sm:text-base">Here&apos;s your career progress at a glance.</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-muted"><span className="size-2 rounded-full bg-accent shadow-[0_0_14px_hsl(var(--accent)/.75)]" /> Workspace synced</div>
      </div>

      {loadError && <DashboardErrorState message={loadError} onRetry={() => setRefreshKey((value) => value + 1)} />}
      {(uploadError || analysisError) && <p role="alert" className="mt-5 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm font-semibold text-red-200">{uploadError || analysisError}</p>}

      <CareerHero state={heroState} fileName={uploadedFile} analyzing={analyzing} onUpload={openFilePicker} onAnalyze={analyzeCv} onViewCv={() => document.getElementById("cv-library")?.scrollIntoView({ behavior: "smooth" })} onViewAnalysis={() => document.getElementById("cv-analysis")?.scrollIntoView({ behavior: "smooth" })} />
      <FeatureOverviewGrid state={heroState} analyzing={analyzing} onAnalyze={analyzeCv} onViewAnalysis={() => document.getElementById("cv-analysis")?.scrollIntoView({ behavior: "smooth" })} />
      <QuickActions onUpload={openFilePicker} />

      <section id="cv-library" className="mt-12 scroll-mt-28">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[.2em] text-accent">Your documents</p><h2 className="mt-2 text-2xl font-black tracking-[-.03em] text-ink">CV library</h2></div><button type="button" onClick={openFilePicker} disabled={isUploading} className="dashboard-focus inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-line/80 bg-panel px-4 text-sm font-black text-ink transition-colors hover:border-accent/60 disabled:opacity-50"><UploadCloud className="size-4 text-accent" /> Upload a new CV</button></div>
        <div className="premium-card mt-5 overflow-hidden rounded-2xl border border-line/80">
          {uploadedFile ? <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div className="flex min-w-0 items-center gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><FileSearch className="size-5" /></span><div className="min-w-0"><p className="truncate font-black text-ink" title={uploadedFile}>{uploadedFile}</p><p className="mt-1 text-xs text-muted">Private storage · {formatStatus(extractionStatus)}</p></div></div><div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">{canOpenCv && uploadedDocumentId && uploadedVersionId && <a href={cvDownloadUrl(uploadedDocumentId, uploadedVersionId)} target="_blank" rel="noreferrer" className="dashboard-focus inline-flex items-center rounded-xl border border-blue/30 bg-blue/10 px-3 py-2 text-xs font-black text-blue hover:bg-blue/15">Open original</a>}<span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${heroState === "failed" ? "border-red-300/30 text-red-300" : heroState === "processing" ? "border-amber/30 text-amber" : "border-accent/30 text-accent"}`}><span className="size-1.5 rounded-full bg-current" /> {heroState === "complete" ? "Analysis complete" : formatStatus(extractionStatus)}</span></div></div> : <div className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center"><span className="grid size-11 place-items-center rounded-xl bg-blue/10 text-blue"><FileUp className="size-5" /></span><div><p className="font-black text-ink">No CV uploaded yet</p><p className="mt-1 text-sm text-muted">Add a PDF or DOCX to unlock personalized career guidance.</p></div></div>}
        </div>
      </section>

      {analysis && <AnalysisPanel analysis={analysis} />}
    </div>
  );
}

function CareerHero({ state, fileName, analyzing, onUpload, onAnalyze, onViewCv, onViewAnalysis }: { state: HeroState; fileName: string | null; analyzing: boolean; onUpload: () => void; onAnalyze: () => void; onViewCv: () => void; onViewAnalysis: () => void }) {
  const copy: Record<HeroState, { eyebrow: string; title: string; description: string }> = {
    empty: { eyebrow: "Your career, in focus", title: "Your next opportunity starts here.", description: "Upload your CV to discover career insights and prepare for your next role." },
    ready: { eyebrow: "Your CV is ready", title: "Your CV is ready for analysis.", description: "Discover your strengths, identify improvements, and take the next step in your career." },
    processing: { eyebrow: "Processing securely", title: "We're preparing your career profile.", description: "Your CV is moving through secure scanning and text extraction. We'll never invent missing information." },
    complete: { eyebrow: "Your insights are ready", title: "Your career insights are ready.", description: "Review transparent CV findings, then turn the next improvement into momentum." },
    failed: { eyebrow: "A little attention needed", title: "Let's get your CV back on track.", description: "We could not finish processing this file. Upload a new PDF or DOCX to try again." },
  };
  const content = copy[state];
  return <section className="dashboard-hero relative mt-8 min-h-[340px] rounded-[1.75rem] border border-white/10 p-7 text-white shadow-[0_28px_80px_hsl(220_60%_3%/.25)] sm:p-10 lg:min-h-[360px] lg:p-12"><div className="hero-orbit hidden sm:block" aria-hidden="true" /><div className="hero-landscape" aria-hidden="true" /><div className="relative z-10 max-w-xl"><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-300">{content.eyebrow}</p><h2 className="mt-5 max-w-2xl text-3xl font-black leading-[1.05] tracking-[-.045em] sm:text-5xl">{content.title}</h2><p className="mt-5 max-w-lg text-sm leading-7 text-slate-300 sm:text-base">{content.description}</p><div className="mt-8 flex flex-wrap items-center gap-3"><HeroAction state={state} fileName={fileName} analyzing={analyzing} onUpload={onUpload} onAnalyze={onAnalyze} onViewCv={onViewCv} onViewAnalysis={onViewAnalysis} /></div></div><div className="absolute bottom-6 right-6 hidden max-w-[14rem] rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md lg:block"><p className="text-[10px] font-black uppercase tracking-[.18em] text-slate-400">Private by design</p><p className="mt-2 text-xs leading-5 text-slate-300">Your CV stays in protected storage and remains scoped to your account.</p></div></section>;
}

function HeroAction({ state, fileName, analyzing, onUpload, onAnalyze, onViewCv, onViewAnalysis }: { state: HeroState; fileName: string | null; analyzing: boolean; onUpload: () => void; onAnalyze: () => void; onViewCv: () => void; onViewAnalysis: () => void }) {
  if (state === "empty" || state === "failed") return <button type="button" onClick={onUpload} className="dashboard-focus inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-black text-accent-ink transition-colors hover:bg-emerald-300"><UploadCloud className="size-4" /> Upload CV <ArrowRight className="size-4" /></button>;
  if (state === "ready") return <><button type="button" onClick={onAnalyze} disabled={analyzing} className="dashboard-focus inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-black text-accent-ink transition-colors hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-60"><Sparkles className="size-4" /> {analyzing ? "Analyzing…" : "Analyze CV"} <ArrowRight className="size-4" /></button><button type="button" onClick={onViewCv} className="dashboard-focus inline-flex h-12 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 text-sm font-black text-white transition-colors hover:bg-white/10">View CV</button><span className="text-xs text-slate-400">{fileName}</span></>;
  if (state === "processing") return <div className="inline-flex h-12 items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-5 text-sm font-black text-slate-200" role="status"><Clock3 className="size-4 animate-pulse text-amber" /> Processing securely…</div>;
  return <><button type="button" onClick={onViewAnalysis} className="dashboard-focus inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-black text-accent-ink transition-colors hover:bg-emerald-300"><FileSearch className="size-4" /> View Analysis <ArrowRight className="size-4" /></button><Link href="/dashboard/jobs" className="dashboard-focus inline-flex h-12 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 text-sm font-black text-white transition-colors hover:bg-white/10">Explore Opportunities</Link></>;
}

function FeatureOverviewGrid({ state, analyzing, onAnalyze, onViewAnalysis }: { state: HeroState; analyzing: boolean; onAnalyze: () => void; onViewAnalysis: () => void }) {
  const cvStatus = state === "complete" ? "Completed" : state === "ready" ? "Ready to analyze" : state === "processing" ? "Processing" : state === "failed" ? "Needs attention" : "Not started";
  return <section className="mt-10"><div className="flex items-end justify-between"><div><p className="text-xs font-black uppercase tracking-[.2em] text-accent">Your toolkit</p><h2 className="mt-2 text-2xl font-black tracking-[-.03em] text-ink">Career momentum</h2></div><span className="hidden text-xs font-bold text-muted sm:block">Built around your evidence</span></div><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><FeatureCard icon={FileSearch} label="CV Analysis" accent="emerald" status={cvStatus} title={state === "complete" ? "Your review is ready" : state === "ready" ? "Turn your CV into a plan" : "Build your career profile"} description={state === "complete" ? "See clear findings and practical improvements from your extracted CV." : "Upload and review your CV with transparent, evidence-backed guidance."} action={state === "complete" ? "View report" : state === "ready" ? "Analyze CV" : state === "failed" ? "Upload again" : "Get started"} onAction={state === "complete" ? onViewAnalysis : state === "ready" ? onAnalyze : undefined} actionHref={state === "empty" || state === "failed" ? "#cv-library" : undefined} actionDisabled={state === "processing" || analyzing} />
    <FeatureCard icon={BriefcaseBusiness} label="Job Matching" accent="amber" status="Available" title="Explore real opportunities" description="Search approved sources and see why each verified listing fits your evidence." action="View opportunities" actionHref="/dashboard/jobs" />
    <FeatureCard icon={MessageSquareText} label="Interview Practice" accent="blue" status="Available" title="Practice with context" description="Prepare with adaptive questions grounded in your CV and target role." action="Start practice" actionHref="/dashboard/interviews" />
    <FeatureCard icon={Bot} label="AI Assistant" accent="violet" status="Coming soon" title="Your career companion" description="Ask for guidance across your CV, jobs, and interview practice when the assistant launches." action="Coming soon" actionDisabled />
  </div></section>;
}

function FeatureCard({ icon: Icon, label, accent, status, title, description, action, actionHref, actionDisabled, onAction }: { icon: typeof FileSearch; label: string; accent: "emerald" | "amber" | "blue" | "violet"; status: string; title: string; description: string; action: string; actionHref?: string; actionDisabled?: boolean; onAction?: () => void }) {
  const accentClasses = { emerald: "bg-accent/10 text-accent", amber: "bg-amber/10 text-amber", blue: "bg-blue/10 text-blue", violet: "bg-violet/10 text-violet" }[accent];
  const statusClasses = { emerald: "text-accent", amber: "text-amber", blue: "text-blue", violet: "text-violet" }[accent];
  const content = <><div className="flex items-start justify-between gap-3"><span className={`grid size-11 place-items-center rounded-xl ${accentClasses}`}><Icon className="size-5" /></span><span className={`inline-flex items-center gap-1.5 pt-1 text-[10px] font-black uppercase tracking-wider ${statusClasses}`}><span className="size-1.5 rounded-full bg-current" />{status}</span></div><p className="mt-5 text-[10px] font-black uppercase tracking-[.16em] text-muted">{label}</p><h3 className="mt-2 text-lg font-black tracking-[-.02em] text-ink">{title}</h3><p className="mt-2 min-h-[3.5rem] text-sm leading-6 text-muted">{description}</p><span className={`mt-6 inline-flex items-center gap-2 text-xs font-black ${actionDisabled ? "text-muted/50" : "text-ink"}`}>{action}<ChevronRight className="size-4" /></span></>;
  if (actionHref && !actionDisabled) return <Link href={actionHref} className="premium-card dashboard-focus min-h-[260px] rounded-2xl border border-line/80 p-5 transition-transform duration-200">{content}</Link>;
  return <button type="button" onClick={onAction} disabled={actionDisabled || (!onAction && !actionHref)} className="premium-card dashboard-focus min-h-[260px] rounded-2xl border border-line/80 p-5 text-left transition-transform duration-200 disabled:cursor-default">{content}</button>;
}

function QuickActions({ onUpload }: { onUpload: () => void }) {
  return <section className="mt-12"><div><p className="text-xs font-black uppercase tracking-[.2em] text-accent">Keep moving</p><h2 className="mt-2 text-2xl font-black tracking-[-.03em] text-ink">Quick actions</h2></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><QuickAction icon={UploadCloud} label="Upload a new CV" copy="Refresh your career evidence" accent="emerald" onClick={onUpload} /><QuickAction icon={BriefcaseBusiness} label="Find matching jobs" copy="Explore verified opportunities" accent="amber" href="/dashboard/jobs" /><QuickAction icon={MessageSquareText} label="Start interview practice" copy="Build confidence with context" accent="blue" href="/dashboard/interviews" /><QuickAction icon={Bot} label="Ask AI Assistant" copy="Available in a future release" accent="violet" disabled /></div></section>;
}

function QuickAction({ icon: Icon, label, copy, accent, href, onClick, disabled }: { icon: typeof UploadCloud; label: string; copy: string; accent: "emerald" | "amber" | "blue" | "violet"; href?: string; onClick?: () => void; disabled?: boolean }) {
  const classes = `dashboard-focus group flex items-center gap-3 rounded-2xl border border-line/80 bg-panel p-4 text-left transition-colors ${disabled ? "cursor-not-allowed opacity-55" : "hover:border-accent/50 hover:bg-panel-elevated"}`;
  const content = <><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${accent === "emerald" ? "bg-accent/10 text-accent" : accent === "amber" ? "bg-amber/10 text-amber" : accent === "blue" ? "bg-blue/10 text-blue" : "bg-violet/10 text-violet"}`}><Icon className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-ink">{label}</span><span className="mt-1 block truncate text-xs text-muted">{copy}</span></span><ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5" /></>;
  if (href && !disabled) return <Link href={href} className={classes}>{content}</Link>;
  return <button type="button" onClick={onClick} disabled={disabled} className={classes}>{content}</button>;
}

function AnalysisPanel({ analysis }: { analysis: CVAnalysis }) {
  return <section id="cv-analysis" className="mt-12 scroll-mt-28 rounded-2xl border border-line/80 bg-panel p-6 sm:p-8"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="text-xs font-black uppercase tracking-[.2em] text-accent">CV analysis</p><h2 className="mt-2 text-2xl font-black tracking-[-.03em] text-ink">Your evidence review</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Transparent checks from the extracted text. These findings are coaching guidance, not a hiring prediction.</p></div><span className="rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-accent">{analysis.analysis_type.replaceAll("_", " ")}</span></div><div className="mt-7 grid gap-3 sm:grid-cols-4">{[["Words", analysis.metrics.word_count], ["Characters", analysis.metrics.character_count], ["Sections", analysis.metrics.detected_section_count], ["Bullets", analysis.metrics.bullet_count]].map(([label, value]) => <div className="rounded-xl border border-line/80 bg-canvas p-4" key={label as string}><p className="text-xs font-bold text-muted">{label}</p><p className="mt-2 text-2xl font-black text-ink">{value}</p></div>)}</div><div className="mt-8 grid gap-8 lg:grid-cols-2"><div><h3 className="font-black text-ink">Checks</h3><div className="mt-3 space-y-3">{analysis.checks.map((check) => <div className="rounded-xl border border-line/80 p-4" key={check.key}><div className="flex items-center justify-between gap-3"><p className="font-bold capitalize text-ink">{check.key.replaceAll("_", " ")}</p><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${check.status === "pass" ? "bg-accent/10 text-accent" : "bg-amber/10 text-amber"}`}>{check.status}</span></div><p className="mt-2 text-sm leading-6 text-muted">{check.detail}</p><p className="mt-2 text-xs font-semibold text-muted">Evidence: {check.evidence}</p></div>)}</div></div><div><h3 className="font-black text-ink">Recommendations</h3>{analysis.recommendations.length ? <ul className="mt-3 space-y-3">{analysis.recommendations.map((item) => <li className="flex gap-2 rounded-xl border border-line/80 p-4 text-sm leading-6 text-muted" key={item}><CircleCheck className="mt-0.5 size-4 shrink-0 text-accent" />{item}</li>)}</ul> : <p className="mt-3 rounded-xl border border-dashed border-line p-4 text-sm text-muted">No additional recommendation was generated from this review.</p>}</div></div></section>;
}

function DashboardSkeleton() {
  return <div className="mx-auto max-w-[1440px] animate-pulse pb-20" aria-label="Loading dashboard" role="status"><div className="h-10 w-72 rounded-xl bg-panel" /><div className="mt-8 h-[340px] rounded-[1.75rem] bg-panel" /><div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <div className="h-64 rounded-2xl bg-panel" key={item} />)}</div><span className="sr-only">Loading your career workspace…</span></div>;
}

function DashboardErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div role="alert" className="mt-6 flex flex-col gap-4 rounded-2xl border border-red-300/25 bg-red-500/10 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><CircleAlert className="mt-0.5 size-5 shrink-0 text-red-300" /><div><p className="font-black text-red-100">We couldn&apos;t load your CV status.</p><p className="mt-1 text-sm text-red-100/70">{message}</p></div></div><button type="button" onClick={onRetry} className="dashboard-focus inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-200/25 px-4 text-sm font-black text-red-100 hover:bg-red-200/10"><RefreshCw className="size-4" /> Try again</button></div>;
}

function deriveHeroState({ cvLoading, uploadedFile, extractionStatus, uploadState, analysis }: { cvLoading: boolean; uploadedFile: string | null; extractionStatus: string | null; uploadState: UploadState; analysis: CVAnalysis | null }): HeroState {
  if (cvLoading || uploadState === "hashing" || uploadState === "uploading" || uploadState === "scanning") return "processing";
  if (!uploadedFile) return "empty";
  if (analysis) return "complete";
  if (["rejected", "scan_failed", "extraction_failed", "needs_ocr"].includes(extractionStatus ?? "")) return "failed";
  if (extractionStatus === "ready") return "ready";
  return "processing";
}

function getGreeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function formatStatus(status: string | null) {
  if (!status) return "Awaiting status";
  return status.replaceAll("_", " ");
}

async function parseResponse<T = unknown>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null) as { detail?: string } | null;
  if (!response.ok) throw new Error(payload?.detail ?? fallback);
  return payload as T;
}

async function waitForExtraction(documentId: string, versionId: string, token: string): Promise<string> {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const response = await fetch(`${apiBaseUrl()}/cv-documents/${documentId}/versions/${versionId}/extraction`, { credentials: "include", headers: { "X-CSRF-Token": token } });
    if (response.ok) {
      const payload = await response.json() as { status: string };
      if (["ready", "needs_ocr", "extraction_failed", "rejected", "scan_failed"].includes(payload.status)) return payload.status;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 2_000));
  }
  return "queued";
}

async function loadLatestCv(signal: AbortSignal): Promise<{ documentId: string; versionId: string; filename: string; status: string } | null> {
  const documentsResponse = await fetch(`${apiBaseUrl()}/cv-documents?limit=1`, { credentials: "include", signal });
  const documents = await parseResponse<{ data: Array<{ id: string; active_version_id: string | null }> }>(documentsResponse, "We could not load your CV library.");
  const document = documents.data[0];
  if (!document?.active_version_id) return null;
  const versionResponse = await fetch(`${apiBaseUrl()}/cv-documents/${document.id}/versions/${document.active_version_id}`, { credentials: "include", signal });
  const version = await parseResponse<{ original_name: string; status: string }>(versionResponse, "We could not load your CV version.");
  const extractionResponse = await fetch(`${apiBaseUrl()}/cv-documents/${document.id}/versions/${document.active_version_id}/extraction`, { credentials: "include", signal });
  const extraction = extractionResponse.ok ? await extractionResponse.json() as { status: string } : null;
  return { documentId: document.id, versionId: document.active_version_id, filename: version.original_name, status: extraction?.status ?? version.status.toLowerCase() };
}
