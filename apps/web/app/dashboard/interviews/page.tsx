"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronRight, CircleStop, LoaderCircle, MessageSquareText, SkipForward, Sparkles } from "lucide-react";
import { apiBaseUrl, csrfToken } from "@/lib/api";

type InterviewStatus = "active" | "completed" | "paused" | "abandoned";
type InterviewMode = "general" | "technical" | "behavioral" | "project" | "job_specific" | "hr";
type InterviewQuestion = {
  id: string;
  sequence: number;
  prompt: string;
  topic: string;
  intent: string;
  source_evidence: string[];
  status: string;
  asked_at: string;
  answered_at: string | null;
  response?: { answer_text: string; skipped: boolean; submitted_at: string } | null;
};
type Evaluation = {
  id: string;
  question_id: string | null;
  rubric_version: string;
  dimensions: Record<string, number>;
  strengths: string[];
  improvements: string[];
  example_structure: string;
  evidence: string[];
  created_at: string;
};
type Interview = {
  id: string;
  cv_version_id: string | null;
  listing_id: string | null;
  mode: InterviewMode;
  difficulty: string;
  status: InterviewStatus;
  max_questions: number;
  current_sequence: number;
  started_at: string;
  completed_at: string | null;
  current_question: InterviewQuestion | null;
  questions: InterviewQuestion[];
  evaluations: Evaluation[];
};
type History = { id: string; mode: InterviewMode; difficulty: string; status: InterviewStatus; question_count: number; answered_count: number; started_at: string; completed_at: string | null };

const modes: Array<{ value: InterviewMode; label: string; copy: string }> = [
  { value: "general", label: "General", copy: "A balanced warm-up across experience and communication." },
  { value: "technical", label: "Technical", copy: "Architecture, trade-offs, testing, and technical depth." },
  { value: "behavioral", label: "Behavioral", copy: "Concrete ownership, collaboration, and decision stories." },
  { value: "project", label: "Project", copy: "Deep practice on a project from your CV." },
  { value: "job_specific", label: "Role-specific", copy: "Connect your evidence to a target role." },
  { value: "hr", label: "HR", copy: "Motivation, expectations, and concise communication." },
];

export default function InterviewsPage() {
  const [mode, setMode] = useState<InterviewMode>("general");
  const [difficulty, setDifficulty] = useState("medium");
  const [maxQuestions, setMaxQuestions] = useState("6");
  const [interview, setInterview] = useState<Interview | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    request<{ data: History[] }>("/interviews?limit=10").then((result) => setHistory(result.data)).catch(() => undefined);
  }, []);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setBusy(true);
      setError(null);
      const created = await request<Interview>("/interviews", { method: "POST", body: JSON.stringify({ mode, difficulty, max_questions: Number(maxQuestions) }) });
      setInterview(created);
      setAnswer("");
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "The interview could not be started.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(skipped = false, endInterview = false) {
    if (!interview?.current_question) return;
    if (!skipped && !answer.trim()) {
      setError("Write an answer, or choose Skip question.");
      return;
    }
    try {
      setBusy(true);
      setError(null);
      const result = await request<{ session: Interview; evaluation: Evaluation | null; completed: boolean }>(`/interviews/${interview.id}/responses`, {
        method: "POST",
        body: JSON.stringify({ answer_text: skipped ? "" : answer, skipped, end_interview: endInterview }),
      });
      const detail = await request<Interview>(`/interviews/${interview.id}`);
      setInterview(detail);
      setAnswer("");
      if (result.completed) setHistory((items) => items.map((item) => item.id === detail.id ? { ...item, status: "completed", completed_at: detail.completed_at, answered_count: detail.questions.filter((question) => question.response).length } : item));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The answer could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    if (!interview) return;
    try {
      setBusy(true);
      const detail = await request<Interview>(`/interviews/${interview.id}/end`, { method: "POST" });
      setInterview(detail);
    } catch (endError) {
      setError(endError instanceof Error ? endError.message : "The interview could not be ended.");
    } finally {
      setBusy(false);
    }
  }

  async function openHistory(id: string) {
    try {
      setBusy(true);
      setError(null);
      setInterview(await request<Interview>(`/interviews/${id}`));
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "The interview history could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  const completed = interview?.status === "completed";
  return <div className="mx-auto max-w-6xl pb-24">
    <div className="flex flex-col justify-between gap-5 border-b pb-8 sm:flex-row sm:items-end"><div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-accent">Phase 4 · Interview coach</p><h1 className="mt-2 text-4xl font-black tracking-[-.04em] sm:text-5xl">Practice with context.</h1><p className="mt-3 max-w-2xl text-muted">One question at a time, grounded in your processed CV. Answers are evaluated with visible coaching rubrics—not personality guesses.</p></div>{interview && <button type="button" onClick={() => setInterview(null)} className="inline-flex items-center gap-2 text-sm font-extrabold text-accent"><ArrowLeft className="size-4"/> New interview</button>}</div>
    {error && <p role="alert" className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-semibold text-red-700">{error}</p>}
    {!interview ? <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_.8fr]"><form onSubmit={start} className="rounded-2xl border bg-panel p-6 sm:p-8"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent"><MessageSquareText className="size-5"/></span><div><h2 className="text-xl font-black">Set up a session</h2><p className="text-sm text-muted">The latest ready CV will be used automatically.</p></div></div><fieldset className="mt-8"><legend className="text-sm font-extrabold">Interview mode</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{modes.map((item) => <label key={item.value} className={`cursor-pointer rounded-xl border p-4 transition ${mode === item.value ? "border-accent bg-accent/10" : "hover:bg-canvas"}`}><input type="radio" className="sr-only" name="mode" value={item.value} checked={mode === item.value} onChange={() => setMode(item.value)}/><span className="font-extrabold">{item.label}</span><span className="mt-1 block text-xs leading-5 text-muted">{item.copy}</span></label>)}</div></fieldset><div className="mt-7 grid gap-4 sm:grid-cols-2"><label><span className="text-sm font-extrabold">Difficulty</span><select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-canvas px-3"><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label><label><span className="text-sm font-extrabold">Questions</span><select value={maxQuestions} onChange={(event) => setMaxQuestions(event.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-canvas px-3"><option value="3">3</option><option value="6">6</option><option value="9">9</option><option value="12">12</option></select></label></div><button disabled={busy} className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-extrabold text-canvas disabled:opacity-60">{busy ? <LoaderCircle className="size-4 animate-spin"/> : <Sparkles className="size-4"/>}{busy ? "Preparing…" : "Start interview"}</button></form><aside className="rounded-2xl bg-ink p-6 text-canvas sm:p-8"><CheckCircle2 className="size-6 text-emerald-300"/><h2 className="mt-6 text-xl font-black">What gets remembered</h2><ul className="mt-4 space-y-4 text-sm leading-6 text-white/70"><li>• Your selected mode and difficulty</li><li>• Previous questions and answers in this session</li><li>• CV evidence used to choose a topic</li><li>• Rubric evidence for clarity, depth, accuracy, and role relevance</li></ul><p className="mt-8 border-t border-white/15 pt-5 text-xs leading-5 text-white/50">This is coaching, not automated employment selection. Voice mode and model-backed follow-ups are planned extensions.</p></aside></div> : <InterviewView interview={interview} answer={answer} setAnswer={setAnswer} busy={busy} completed={completed} submit={submit} end={end}/>}<section className="mt-12 border-t pt-8"><div className="flex items-center justify-between"><div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-accent">Your practice history</p><h2 className="mt-2 text-2xl font-black">Keep the thread.</h2></div><span className="text-sm text-muted">{history.length} session{history.length === 1 ? "" : "s"}</span></div>{history.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{history.map((item) => <button key={item.id} type="button" onClick={() => openHistory(item.id)} className="rounded-xl border bg-panel p-4 text-left transition hover:-translate-y-0.5 hover:border-accent"><div className="flex items-center justify-between"><span className="font-extrabold capitalize">{item.mode.replace("_", " ")}</span><span className="rounded-full border px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-muted">{item.status}</span></div><p className="mt-3 text-sm text-muted">{item.answered_count}/{item.question_count} answered · {item.difficulty} difficulty</p><p className="mt-3 text-xs text-muted">{new Date(item.started_at).toLocaleDateString()}</p></button>)}</div> : <p className="mt-5 rounded-xl border border-dashed p-5 text-sm text-muted">No sessions yet. Start a short practice round above.</p>}</section>
  </div>;
}

function InterviewView({ interview, answer, setAnswer, busy, completed, submit, end }: { interview: Interview; answer: string; setAnswer: (value: string) => void; busy: boolean; completed: boolean; submit: (skipped?: boolean, endInterview?: boolean) => Promise<void>; end: () => Promise<void> }) {
  const overall = interview.evaluations.find((evaluation) => evaluation.question_id === null);
  return <section className="mt-8"><div className="flex flex-col justify-between gap-4 rounded-2xl border bg-panel p-6 sm:flex-row sm:items-center sm:p-8"><div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-accent">{interview.mode.replace("_", " ")} · {interview.difficulty}</p><h2 className="mt-2 text-2xl font-black">{completed ? "Session complete" : `Question ${interview.current_sequence} of ${interview.max_questions}`}</h2></div>{!completed && <button type="button" onClick={end} disabled={busy} className="inline-flex items-center gap-2 text-sm font-extrabold text-muted hover:text-ink"><CircleStop className="size-4"/> End session</button>}</div><div className="mt-5 space-y-4">{interview.questions.map((question) => <article key={question.id} className="rounded-2xl border bg-panel p-6 sm:p-8"><div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-xs font-black text-accent">{question.sequence.toString().padStart(2, "0")}</span><div className="flex-1"><p className="text-lg font-extrabold leading-8">{question.prompt}</p><p className="mt-2 text-xs font-bold uppercase tracking-wider text-muted">{question.topic.replaceAll("_", " ")}</p>{question.response && <div className="mt-5 rounded-xl bg-canvas p-4 text-sm leading-7 text-muted"><span className="font-extrabold text-ink">Your answer: </span>{question.response.skipped ? "Skipped" : question.response.answer_text}</div>}</div></div></article>)}</div>{!completed && interview.current_question && <div className="mt-5 rounded-2xl border-2 border-accent/30 bg-panel p-6 sm:p-8"><label className="text-sm font-extrabold" htmlFor="answer">Your answer</label><textarea id="answer" value={answer} onChange={(event) => setAnswer(event.target.value)} rows={7} placeholder="Use a specific example. Include your role, decisions, and outcome where possible." className="mt-3 w-full resize-y rounded-xl border bg-canvas p-4 text-sm leading-7 outline-none focus:border-accent"/><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => submit(false, false)} disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-extrabold text-accent-ink disabled:opacity-60">{busy && <LoaderCircle className="size-4 animate-spin"/>} Submit answer <ChevronRight className="size-4"/></button><button type="button" onClick={() => submit(true, false)} disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-extrabold"><SkipForward className="size-4"/> Skip question</button><button type="button" onClick={() => submit(false, true)} disabled={busy || !answer.trim()} className="inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-extrabold text-muted disabled:opacity-50">Finish with this answer</button></div></div>}{completed && overall && <Feedback evaluation={overall}/>}</section>;
}

function Feedback({ evaluation }: { evaluation: Evaluation }) {
  return <section className="mt-8 rounded-2xl border bg-panel p-6 sm:p-8"><p className="text-xs font-extrabold uppercase tracking-[.16em] text-accent">Rubric feedback · {evaluation.rubric_version}</p><h2 className="mt-2 text-2xl font-black">What to practice next</h2><div className="mt-6 grid gap-3 sm:grid-cols-4">{Object.entries(evaluation.dimensions).map(([key, value]) => <div key={key} className="rounded-xl border bg-canvas p-4"><p className="text-xs font-bold capitalize text-muted">{key.replaceAll("_", " ")}</p><p className="mt-2 text-2xl font-black">{value}/5</p></div>)}</div><div className="mt-7 grid gap-7 lg:grid-cols-2"><div><h3 className="font-extrabold">Strengths demonstrated</h3>{evaluation.strengths.length ? <ul className="mt-3 space-y-2">{evaluation.strengths.map((item) => <li key={item} className="rounded-lg border p-3 text-sm leading-6">{item}</li>)}</ul> : <p className="mt-3 text-sm text-muted">No supported strengths were recorded yet.</p>}</div><div><h3 className="font-extrabold">Improvements</h3>{evaluation.improvements.length ? <ul className="mt-3 space-y-2">{evaluation.improvements.map((item) => <li key={item} className="rounded-lg border p-3 text-sm leading-6">{item}</li>)}</ul> : <p className="mt-3 text-sm text-muted">No improvement action was generated.</p>}<p className="mt-5 text-xs leading-5 text-muted">Suggested answer structure: {evaluation.example_structure}</p></div></div></section>;
}

async function request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = csrfToken();
  if (!token) throw new Error("Your session security token is missing. Refresh the page and try again.");
  const response = await fetch(`${apiBaseUrl()}${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": token, ...(init.headers ?? {}) } });
  const body = await response.json().catch(() => null) as { detail?: string } | null;
  if (!response.ok) throw new Error(body?.detail ?? "The interview request could not be completed.");
  return body as T;
}
