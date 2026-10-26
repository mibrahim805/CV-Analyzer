"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileUp, LoaderCircle, UploadCloud, X } from "lucide-react";
import { MAX_CV_BYTES, uploadCVFile } from "@/lib/cv-api";

type Props = { open: boolean; onClose: () => void; onUploaded: () => void };
type Stage = "idle" | "hashing" | "uploading" | "scanning" | "extracting" | "success" | "error";

const stageLabels: Record<Stage, string> = { idle: "Ready to upload", hashing: "Preparing secure upload", uploading: "Uploading to private storage", scanning: "Security scanning", extracting: "Extracting CV content", success: "CV uploaded", error: "Upload needs attention" };

export function CVUploadDialog({ open, onClose, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = ["hashing", "uploading", "scanning", "extracting"].includes(stage);
  if (!open) return null;

  async function selectFile(file: File | undefined) {
    if (!file || busy) return;
    setFileName(file.name); setError(null);
    try {
      await uploadCVFile(file, (progress) => setStage(progress));
      setStage("success");
      onUploaded();
    } catch (reason) {
      setStage("error"); setError(reason instanceof Error ? reason.message : "The CV could not be uploaded. Please try again.");
    }
  }

  function close() {
    if (busy) return;
    setStage("idle"); setFileName(null); setError(null); onClose();
  }

  return <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="upload-cv-title" onKeyDown={(event) => { if (event.key === "Escape") close(); }} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className="premium-card w-full max-w-xl rounded-3xl border border-line/90 p-5 shadow-2xl sm:p-7">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.2em] text-accent">CV library</p><h2 id="upload-cv-title" className="mt-2 text-2xl font-black tracking-[-.03em] text-ink">Upload a new CV</h2><p className="mt-2 text-sm text-muted">PDF or DOCX, up to {Math.round(MAX_CV_BYTES / 1024 / 1024)} MB.</p></div><button type="button" onClick={close} disabled={busy} className="dashboard-focus grid size-10 place-items-center rounded-xl text-muted hover:bg-panel-elevated hover:text-ink disabled:opacity-40" aria-label="Close upload dialog"><X className="size-5" /></button></div>
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void selectFile(event.dataTransfer.files[0]); }} className="dashboard-focus mt-7 flex min-h-48 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-accent/35 bg-accent/[.04] px-6 text-center transition-colors hover:border-accent/70 hover:bg-accent/[.08] disabled:cursor-wait disabled:opacity-70"><span className="grid size-14 place-items-center rounded-2xl bg-accent/10 text-accent"><UploadCloud className="size-7" /></span><span className="mt-4 text-sm font-black text-ink">Drag and drop your CV here</span><span className="mt-1 text-xs text-muted">or <span className="text-accent">browse files</span></span><input ref={inputRef} className="sr-only" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { void selectFile(event.target.files?.[0]); event.target.value = ""; }} /></button>
      {fileName && <div className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-panel-elevated/55 p-3"><span className="grid size-10 place-items-center rounded-xl bg-blue/10 text-blue"><FileUp className="size-5" /></span><span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{fileName}</span>{stage === "success" && <CheckCircle2 className="size-5 shrink-0 text-accent" />}{busy && <LoaderCircle className="size-5 shrink-0 animate-spin text-accent" />}</div>}
      {(busy || stage === "success") && <p role="status" className="mt-4 text-sm font-semibold text-muted">{stageLabels[stage]}{stage === "success" ? ". Your library is being refreshed." : "…"}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-300/30 bg-red-500/10 p-3 text-sm font-semibold text-red-200">{error}</p>}
      <div className="mt-7 flex justify-end gap-3"><button type="button" onClick={close} disabled={busy} className="dashboard-focus rounded-xl px-4 py-2.5 text-sm font-black text-muted hover:bg-panel-elevated hover:text-ink disabled:opacity-40">Cancel</button><button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="dashboard-focus inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-black text-accent-ink transition-colors hover:bg-accent/90 disabled:opacity-40">{stage === "success" ? "Upload another" : "Choose file"}</button></div>
    </div>
  </div>;
}
