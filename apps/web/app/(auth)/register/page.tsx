import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function RegisterPage() {
  return <div className="w-full"><p className="text-xs font-extrabold uppercase tracking-[.16em] text-accent">Your private workspace</p><h1 className="mt-3 text-4xl font-black tracking-[-.04em]">Build from what you’ve actually done.</h1><p className="mt-3 text-muted">Create your account, then add a CV when you are ready.</p><AuthForm mode="register"/><p className="mt-7 text-center text-sm text-muted">Already have an account? <Link className="font-bold text-ink underline decoration-accent decoration-2 underline-offset-4" href="/login">Sign in</Link></p></div>;
}
