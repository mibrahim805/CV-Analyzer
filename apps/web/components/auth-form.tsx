"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const body = mode === "register"
      ? { email: data.get("email"), password: data.get("password"), display_name: data.get("display_name"), terms_version: "2026-10-24" }
      : { email: data.get("email"), password: data.get("password") };
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL
        ?? `${window.location.protocol}//${window.location.hostname}:8000/api/v1`;
      const response = await fetch(`${apiBase}/auth/${mode}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(problem?.detail ?? "We could not complete that request.");
      }
      router.push("/dashboard");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not complete that request.");
    } finally { setPending(false); }
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={submit}>
      {mode === "register" && <Field label="Name" name="display_name" autoComplete="name" placeholder="Your name" />}
      <Field label="Email" name="email" type="email" autoComplete="email" placeholder="you@example.com" />
      <Field label="Password" name="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} hint={mode === "register" ? "At least 12 characters with upper, lower, and numeric text." : undefined} />
      {error && <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-700">{error}</div>}
      <Button className="w-full" disabled={pending}>{pending ? "Working…" : mode === "login" ? "Sign in" : "Create workspace"}</Button>
      {mode === "register" && <p className="text-center text-xs leading-5 text-muted">By continuing, you agree to the terms and acknowledge the privacy notice. No document is uploaded until you choose one.</p>}
    </form>
  );
}

function Field({ label, hint, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return <label className="block text-sm font-bold">{label}<input required className="mt-2 h-12 w-full rounded-xl border bg-canvas px-4 font-normal outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/20" {...props}/>{hint && <span className="mt-2 block text-xs font-normal leading-5 text-muted">{hint}</span>}</label>;
}
