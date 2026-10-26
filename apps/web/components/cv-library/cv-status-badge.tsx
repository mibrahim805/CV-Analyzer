import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle, ShieldCheck } from "lucide-react";

export type CVState = "ready" | "processing" | "failed" | "uploaded" | "unknown";

export function cvState(status: string | null | undefined): CVState {
  const value = (status ?? "").toLowerCase();
  if (value === "ready") return "ready";
  if (["scan_failed", "rejected", "extraction_failed", "failed", "malware_detected"].includes(value)) return "failed";
  if (["awaiting_upload", "quarantined", "scanning", "extracting", "processing", "needs_ocr"].includes(value)) return "processing";
  if (["uploaded", "pending"].includes(value)) return "uploaded";
  return "unknown";
}

const labels: Record<CVState, string> = { ready: "Ready for analysis", processing: "Processing", failed: "Processing failed", uploaded: "Uploaded", unknown: "Status unavailable" };

export function CVStatusBadge({ status }: { status: string | null | undefined }) {
  const state = cvState(status);
  const Icon = state === "ready" ? CheckCircle2 : state === "failed" ? AlertTriangle : state === "processing" ? LoaderCircle : state === "uploaded" ? ShieldCheck : Clock3;
  const tone = state === "ready" ? "border-accent/30 bg-accent/10 text-accent" : state === "failed" ? "border-red-300/30 bg-red-500/10 text-red-200" : state === "processing" ? "border-amber/30 bg-amber/10 text-amber" : "border-line bg-panel-elevated text-muted";
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${tone}`}><Icon className={`size-3.5 ${state === "processing" ? "animate-spin" : ""}`} />{labels[state]}</span>;
}

export function AnalysisBadge({ analyzed }: { analyzed: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${analyzed ? "border-blue/30 bg-blue/10 text-blue" : "border-line bg-panel-elevated text-muted"}`}><span className="size-1.5 rounded-full bg-current" />{analyzed ? "Analyzed" : "Not analyzed"}</span>;
}
