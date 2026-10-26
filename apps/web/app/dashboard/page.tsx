"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { ArrowRight, FileUp, LockKeyhole, Sparkles } from "lucide-react";
import { useCurrentUser } from "@/components/app-shell";
import { apiBaseUrl, csrfToken } from "@/lib/api";

const MAX_CV_BYTES = 10 * 1024 * 1024;
const MEDIA_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

type UploadState = "idle" | "hashing" | "uploading" | "scanning" | "success";

type UploadInitiateResponse = {
  document: { id: string };
  version: { id: string };
  upload: { url: string; method?: string; headers: Record<string, string> };
};

type CVAnalysis = {
  analysis_type: string;
  metrics: Record<string, number>;
  checks: Array<{ key: string; status: string; detail: string; evidence: string }>;
  recommendations: string[];
};

export default function DashboardPage() {
  const { user, loading } = useCurrentUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [extractionStatus, setExtractionStatus] = useState<string | null>(null);
  const [uploadedDocumentId, setUploadedDocumentId] = useState<string | null>(null);
  const [uploadedVersionId, setUploadedVersionId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<CVAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const displayName = user?.profile.display_name?.trim() || user?.email.split("@")[0] || "there";
  const isUploading = uploadState === "hashing" || uploadState === "uploading" || uploadState === "scanning";

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    loadLatestCv(controller.signal)
      .then((latest) => {
        if (!latest) return;
        setUploadedFile(latest.filename);
        setUploadedDocumentId(latest.documentId);
        setUploadedVersionId(latest.versionId);
        setExtractionStatus(latest.status);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [user]);

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploadError(null);
    setSelectedFile(file.name);
    setUploadedFile(null);
    setExtractionStatus(null);
    setUploadedDocumentId(null);
    setUploadedVersionId(null);
    setAnalysis(null);
    setAnalysisError(null);

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
      const initiate = await parseResponse<UploadInitiateResponse>(initiateResponse);

      const objectResponse = await fetch(initiate.upload.url, {
        method: initiate.upload.method ?? "PUT",
        headers: initiate.upload.headers,
        body: file,
      });
      if (!objectResponse.ok) throw new Error("The file could not be transferred to secure storage.");

      setUploadState("scanning");
      const completeResponse = await fetch(
        `${apiBaseUrl()}/cv-documents/${initiate.document.id}/versions/${initiate.version.id}/complete`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
          body: JSON.stringify({ byte_size: file.size, sha256 }),
        },
      );
      await parseResponse(completeResponse);
      const finalExtractionStatus = await waitForExtraction(initiate.document.id, initiate.version.id, token);
      if (finalExtractionStatus === "rejected" || finalExtractionStatus === "extraction_failed") {
        throw new Error("The CV was uploaded, but its text could not be extracted.");
      }
      setExtractionStatus(finalExtractionStatus);
      setUploadState("success");
      setUploadedFile(file.name);
      setUploadedDocumentId(initiate.document.id);
      setUploadedVersionId(initiate.version.id);
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
      setAnalysis(await parseResponse<CVAnalysis>(response));
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "The CV could not be analyzed.");
    } finally {
      setAnalyzing(false);
    }
  }

  function openFilePicker() {
    if (!isUploading) fileInputRef.current?.click();
  }

  const statusMessage = isUploading
    ? uploadState === "hashing"
      ? "Preparing your CV…"
      : uploadState === "uploading"
        ? "Uploading securely…"
        : "Upload complete. Running security scan…"
    : uploadState === "success"
      ? extractionStatus === "ready"
        ? `${uploadedFile ?? "Your CV"} text is ready for the analysis step.`
        : extractionStatus === "needs_ocr"
          ? `${uploadedFile ?? "Your CV"} needs OCR before it can be analyzed.`
          : `${uploadedFile ?? "Your CV"} is queued for security scanning.`
      : null;

  return <div className="mx-auto max-w-6xl pb-24">
    <input
      ref={fileInputRef}
      className="sr-only"
      type="file"
      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      onChange={handleFileSelected}
      disabled={isUploading}
      aria-label="Choose a PDF or DOCX CV"
    />
    <div className="flex flex-col justify-between gap-5 border-b pb-8 sm:flex-row sm:items-end">
      <div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-accent">Foundation ready</p><h1 className="mt-2 text-4xl font-black tracking-[-.04em] sm:text-5xl">Good morning, {loading ? "there" : displayName}.</h1><p className="mt-3 max-w-2xl text-muted">Start with a CV. We’ll verify the file before any analysis begins.</p></div>
      <button type="button" onClick={openFilePicker} disabled={isUploading} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-ink px-5 text-sm font-extrabold text-canvas disabled:cursor-wait disabled:opacity-60"><FileUp className="size-4"/>{isUploading ? "Uploading…" : "Add a CV"}</button>
    </div>
    <div className="mt-5 min-h-6 text-sm" aria-live="polite">
      {statusMessage && <p className="text-emerald-700">{statusMessage}</p>}
      {uploadError && <p className="text-red-700">{uploadError}</p>}
      {selectedFile && !statusMessage && !uploadError && <p className="text-muted">Selected: {selectedFile}</p>}
      {extractionStatus === "ready" && uploadedDocumentId && <button type="button" onClick={analyzeCv} disabled={analyzing} className="mt-3 inline-flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-extrabold text-accent-ink disabled:cursor-wait disabled:opacity-60">{analyzing ? "Analyzing…" : "Analyze CV"}</button>}
      {analysisError && <p className="mt-2 text-red-700">{analysisError}</p>}
    </div>
    <section className="grid gap-8 py-5 lg:grid-cols-[1.45fr_.55fr]"><div><h2 className="text-xl font-extrabold">Your starting line</h2><div className="mt-5 overflow-hidden rounded-2xl border bg-panel"><div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center"><div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-accent/10 text-accent"><FileUp/></div><div className="flex-1"><p className="font-extrabold">{uploadedFile ? "CV received" : "Upload your first CV"}</p><p className="mt-1 text-sm leading-6 text-muted">PDF or DOCX, up to 10 MB. It enters quarantine and is malware-scanned before processing.</p></div><button type="button" onClick={openFilePicker} disabled={isUploading} className="inline-flex items-center gap-2 text-sm font-extrabold text-accent disabled:cursor-wait disabled:opacity-60">{isUploading ? "Uploading…" : "Choose file"} <ArrowRight className="size-4"/></button></div><div className="grid gap-px bg-line sm:grid-cols-3">{[["1","Secure upload"],["2","Review extraction"],["3","Set your direction"]].map(([n,t]) => <div className="bg-canvas p-4" key={n}><span className="mr-2 font-mono text-xs text-accent">{n.padStart(2,"0")}</span><span className="text-sm font-bold">{t}</span></div>)}</div></div></div>
      <aside><h2 className="text-xl font-extrabold">Privacy status</h2><div className="mt-5 rounded-2xl bg-ink p-6 text-canvas"><LockKeyhole className="size-6 text-emerald-300"/><p className="mt-5 font-extrabold">{extractionStatus === "ready" ? "CV securely processed" : uploadedFile ? "CV in secure quarantine" : "No CV stored yet"}</p><p className="mt-2 text-sm leading-6 text-white/60">{uploadedFile ? "Your original stays private in object storage, with access limited to your account." : "Your workspace contains only your account profile. You control document retention and deletion."}</p><button type="button" className="mt-5 text-sm font-bold text-emerald-300">Review data controls</button></div></aside></section>
    {analysis && <AnalysisPanel analysis={analysis}/>}<section className="border-t pt-10"><div className="flex items-center gap-2"><Sparkles className="size-5 text-accent"/><h2 className="text-xl font-extrabold">What unlocks next</h2></div><div className="mt-6 grid gap-0 divide-y border-y sm:grid-cols-3 sm:divide-x sm:divide-y-0"><Preview n="01" title="CV intelligence" copy="Evidence-backed improvements and structured facts you can correct."/><Preview n="02" title="Real opportunities" copy="Verified listings ranked with transparent relevance criteria."/><Preview n="03" title="Interview coaching" copy="Adaptive questions grounded in your CV and selected role."/></div></section>
  </div>;
}

async function parseResponse<T = unknown>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as { detail?: string } | null;
  if (!response.ok) throw new Error(payload?.detail ?? "The CV could not be uploaded. Please try again.");
  return payload as T;
}

async function waitForExtraction(documentId: string, versionId: string, token: string): Promise<string> {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const response = await fetch(`${apiBaseUrl()}/cv-documents/${documentId}/versions/${versionId}/extraction`, {
      credentials: "include",
      headers: { "X-CSRF-Token": token },
    });
    if (response.ok) {
      const payload = await response.json() as { status: string };
      if (["ready", "needs_ocr", "extraction_failed", "rejected"].includes(payload.status)) return payload.status;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 2_000));
  }
  return "queued";
}

async function loadLatestCv(signal: AbortSignal): Promise<{ documentId: string; versionId: string; filename: string; status: string } | null> {
  const documentsResponse = await fetch(`${apiBaseUrl()}/cv-documents?limit=1`, { credentials: "include", signal });
  const documents = await parseResponse<{ data: Array<{ id: string; active_version_id: string | null }> }>(documentsResponse);
  const document = documents.data[0];
  if (!document?.active_version_id) return null;
  const versionResponse = await fetch(`${apiBaseUrl()}/cv-documents/${document.id}/versions/${document.active_version_id}`, {
    credentials: "include",
    signal,
  });
  const version = await parseResponse<{ original_name: string; status: string }>(versionResponse);
  const extractionResponse = await fetch(`${apiBaseUrl()}/cv-documents/${document.id}/versions/${document.active_version_id}/extraction`, {
    credentials: "include",
    signal,
  });
  const extraction = extractionResponse.ok ? await extractionResponse.json() as { status: string } : null;
  return {
    documentId: document.id,
    versionId: document.active_version_id,
    filename: version.original_name,
    status: extraction?.status ?? version.status.toLowerCase(),
  };
}

function Preview({n,title,copy}:{n:string;title:string;copy:string}) { return <article className="py-6 sm:px-6 sm:first:pl-0"><span className="font-mono text-xs text-accent">{n}</span><h3 className="mt-4 font-extrabold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted">{copy}</p><span className="mt-4 inline-block rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-muted">Planned phase</span></article>; }

function AnalysisPanel({ analysis }: { analysis: CVAnalysis }) {
  return <section className="mt-10 rounded-2xl border bg-panel p-6 sm:p-8"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-accent">CV analysis</p><h2 className="mt-2 text-2xl font-black tracking-[-.03em]">Evidence review</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Transparent checks from the extracted text. This foundation review is not a hiring prediction or an AI-generated claim.</p></div><span className="rounded-full border px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-muted">{analysis.analysis_type.replaceAll("_", " ")}</span></div><div className="mt-7 grid gap-3 sm:grid-cols-4">{[["Words", analysis.metrics.word_count], ["Characters", analysis.metrics.character_count], ["Sections", analysis.metrics.detected_section_count], ["Bullets", analysis.metrics.bullet_count]].map(([label, value]) => <div className="rounded-xl border bg-canvas p-4" key={label as string}><p className="text-xs font-bold text-muted">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>)}</div><div className="mt-7 grid gap-8 lg:grid-cols-2"><div><h3 className="font-extrabold">Checks</h3><div className="mt-3 space-y-3">{analysis.checks.map((check) => <div className="rounded-xl border p-4" key={check.key}><div className="flex items-center justify-between gap-3"><p className="font-bold">{check.key.replaceAll("_", " ")}</p><span className={`rounded-full px-2 py-1 text-[10px] font-extrabold uppercase ${check.status === "pass" ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"}`}>{check.status}</span></div><p className="mt-2 text-sm leading-6 text-muted">{check.detail}</p><p className="mt-2 text-xs font-semibold text-muted">Evidence: {check.evidence}</p></div>)}</div></div><div><h3 className="font-extrabold">Recommendations</h3><ul className="mt-3 space-y-3">{analysis.recommendations.length ? analysis.recommendations.map((recommendation) => <li className="rounded-xl border p-4 text-sm leading-6" key={recommendation}>{recommendation}</li>) : <li className="rounded-xl border p-4 text-sm leading-6 text-muted">No foundation recommendations were generated.</li>}</ul></div></div></section>;
}
