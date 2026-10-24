import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return <div className="w-full"><p className="text-xs font-extrabold uppercase tracking-[.16em] text-accent">Welcome back</p><h1 className="mt-3 text-4xl font-black tracking-[-.04em]">Continue your career work.</h1><p className="mt-3 text-muted">Your CV versions, saved opportunities, and practice history stay connected.</p><AuthForm mode="login"/><p className="mt-7 text-center text-sm text-muted">New here? <Link className="font-bold text-ink underline decoration-accent decoration-2 underline-offset-4" href="/register">Create a workspace</Link></p></div>;
}
