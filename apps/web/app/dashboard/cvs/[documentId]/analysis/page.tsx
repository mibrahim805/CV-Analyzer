"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { AnalysisBlocked, AnalysisError, AnalysisHeader, AnalysisSkeleton, AnalysisTabs, ANALYSIS_TABS, ContentPanel, OverviewPanel, RecommendationsPanel, UnsupportedPanel, type AnalysisTab } from "@/components/cv-analysis/analysis-ui";
import { analyzeCV, getCVDocument, getCVExtraction, getCVVersion, type CVAnalysis, type CVExtractionStatus, type CVVersion } from "@/lib/cv-api";

type Phase = "loading" | "analyzing" | "ready" | "blocked" | "error";

export default function CVAnalysisPage() {
  const params = useParams<{ documentId: string }>();
  const searchParams = useSearchParams();
  const documentId = params.documentId;
  const requestedVersionId = searchParams.get("versionId");
  const [version, setVersion] = useState<CVVersion | null>(null);
  const [extraction, setExtraction] = useState<CVExtractionStatus | null>(null);
  const [analysis, setAnalysis] = useState<CVAnalysis | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AnalysisTab>("overview");

  const load = useCallback(async () => {
    if (!documentId) return;
    setPhase("loading"); setError(null); setAnalysis(null);
    try {
      const document = requestedVersionId ? null : await getCVDocument(documentId);
      const versionId = requestedVersionId ?? document?.active_version_id;
      if (!versionId) throw new Error("This CV does not have an active version to analyze.");
      const [nextVersion, nextExtraction] = await Promise.all([getCVVersion(documentId, versionId), getCVExtraction(documentId, versionId)]);
      setVersion(nextVersion); setExtraction(nextExtraction);
      if (nextVersion.status !== "ready") { setPhase("blocked"); return; }
      setPhase("analyzing");
      const nextAnalysis = await analyzeCV(documentId, versionId);
      setAnalysis(nextAnalysis); setPhase("ready");
    } catch (reason) {
      setPhase("error"); setError(reason instanceof Error ? reason.message : "The CV analysis could not be loaded.");
    }
  }, [documentId, requestedVersionId]);

  useEffect(() => { void load(); }, [load]);

  async function reanalyze() {
    if (!version || phase === "analyzing") return;
    setPhase("analyzing"); setError(null);
    try { const result = await analyzeCV(documentId, version.id); setAnalysis(result); setPhase("ready"); }
    catch (reason) { setPhase("error"); setError(reason instanceof Error ? reason.message : "The CV could not be analyzed."); }
  }

  function downloadReport() {
    if (!version || !analysis) return;
    const lines = [
      "CareerPilot CV Analysis Report",
      `CV: ${version.original_name}`,
      `Generated: ${new Date(analysis.generated_at).toISOString()}`,
      `Methodology: ${analysis.analysis_type}`,
      "",
      "This report contains deterministic document checks. It is not an ATS score or hiring prediction.",
      "",
      "DOCUMENT METRICS",
      ...Object.entries(analysis.metrics).map(([key, value]) => `${key}: ${value}`),
      "",
      "CHECKS",
      ...analysis.checks.flatMap((check) => [`${check.key} — ${check.status}`, check.detail, `Evidence: ${check.evidence}`, ""]),
      "RECOMMENDATIONS",
      ...analysis.recommendations.map((recommendation, index) => `${index + 1}. ${recommendation}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${version.original_name.replace(/\.(pdf|docx)$/i, "")}-careerpilot-analysis.txt`; anchor.click(); URL.revokeObjectURL(url);
  }

  const tabContent = useMemo(() => {
    if (!analysis) return null;
    if (activeTab === "overview") return <OverviewPanel analysis={analysis} onTabChange={setActiveTab} />;
    if (activeTab === "content") return <ContentPanel analysis={analysis} />;
    if (activeTab === "recommendations") return <RecommendationsPanel analysis={analysis} />;
    return <UnsupportedPanel section={ANALYSIS_TABS.find((tab) => tab.id === activeTab)?.label ?? activeTab} />;
  }, [activeTab, analysis]);

  if (phase === "loading" || phase === "analyzing" && !version) return <AnalysisSkeleton />;
  if (phase === "error" || !version) return <div className="mx-auto max-w-[1440px] pb-20"><Link href="/dashboard/cvs" className="dashboard-focus mb-8 inline-flex items-center gap-2 text-sm font-black text-muted hover:text-ink"><ArrowLeft className="size-4" /> Back to My CVs</Link><AnalysisError message={error ?? "This CV could not be found."} onRetry={() => void load()} /></div>;
  if (phase === "blocked") return <div className="mx-auto max-w-[1440px] pb-20"><Link href="/dashboard/cvs" className="dashboard-focus mb-8 inline-flex items-center gap-2 text-sm font-black text-muted hover:text-ink"><ArrowLeft className="size-4" /> Back to My CVs</Link><AnalysisBlocked version={version} onRetry={() => void load()} /></div>;
  if (!analysis) return null;

  return <div className="mx-auto max-w-[1440px] pb-20"><AnalysisHeader version={version} extraction={extraction} analysis={analysis} analyzing={phase === "analyzing"} onReanalyze={() => void reanalyze()} onDownload={downloadReport} /><div className="mt-8"><AnalysisTabs active={activeTab} onChange={setActiveTab} /></div><main className="mt-8">{tabContent}</main><div className="mt-8 flex items-center justify-between gap-3 rounded-2xl border border-line/70 bg-panel/60 p-4"><p className="text-xs leading-5 text-muted"><span className="font-black text-ink">Report version:</span> {analysis.analysis_type} · Generated from CV version {version.version_no}.</p><button type="button" onClick={() => void reanalyze()} disabled={phase === "analyzing"} className="dashboard-focus inline-flex shrink-0 items-center gap-2 text-xs font-black text-muted hover:text-ink disabled:opacity-50"><RefreshCw className={`size-3.5 ${phase === "analyzing" ? "animate-spin" : ""}`} /> Refresh report</button></div></div>;
}
