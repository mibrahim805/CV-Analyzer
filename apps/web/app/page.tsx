import { ArrowRight, Check, FileSearch, Fingerprint, MessagesSquare, Radar, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/brand";

const flow = [
  { n: "01", title: "Bring the evidence", copy: "Your CV is scanned, extracted, and separated into facts you can inspect and correct. No invented achievements." },
  { n: "02", title: "See what matters", copy: "Recommendations explain the criterion, the evidence behind it, and how a stronger version would read." },
  { n: "03", title: "Move with context", copy: "Discover verified openings, understand real gaps, then practice an interview grounded in that exact role." },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8">
        <Brand />
        <nav className="hidden items-center gap-8 text-sm font-semibold md:flex" aria-label="Main navigation">
          <a href="#method" className="text-muted hover:text-ink">How it works</a>
          <a href="#trust" className="text-muted hover:text-ink">Trust</a>
          <Link href="/login" className="text-muted hover:text-ink">Sign in</Link>
          <Link href="/register" className="rounded-xl bg-ink px-4 py-2.5 text-canvas transition hover:-translate-y-0.5">Start with your CV</Link>
        </nav>
        <Link href="/register" className="rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-canvas md:hidden">Get started</Link>
      </header>

      <section className="relative mx-auto grid max-w-7xl gap-14 px-5 pb-24 pt-16 sm:px-8 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:pb-32 lg:pt-24">
        <div className="relative z-10">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border bg-panel px-3 py-1.5 text-xs font-extrabold uppercase tracking-[.16em] text-muted"><Radar className="size-3.5 text-accent" /> Career intelligence, with receipts</p>
          <h1 className="max-w-3xl text-5xl font-black leading-[.98] tracking-[-.055em] sm:text-7xl lg:text-[5.4rem]">Your next career move should not be a guess.</h1>
          <p className="mt-7 max-w-2xl font-serif text-xl leading-8 text-muted sm:text-2xl">CareerPilot turns your real experience into clear CV decisions, relevant opportunities, and focused interview practice—without pretending an algorithm can predict your future.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/register" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-extrabold text-accent-ink shadow-soft transition hover:-translate-y-0.5">Analyze your first CV <ArrowRight className="size-4" /></Link>
            <a href="#method" className="inline-flex h-12 items-center justify-center rounded-xl border bg-panel px-6 text-sm font-bold hover:bg-canvas">Explore the method</a>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-7 gap-y-3 text-sm font-semibold text-muted">
            {["Your facts stay distinguishable", "Every score is explained", "No fake job listings"].map((item) => <li key={item} className="flex items-center gap-2"><Check className="size-4 text-accent" />{item}</li>)}
          </ul>
        </div>

        <div className="relative lg:pl-8" aria-label="Illustrative CV analysis preview">
          <div className="absolute -inset-24 -z-10 rounded-full bg-accent/10 blur-3xl" />
          <div className="noise rotate-1 rounded-[2rem] border bg-panel p-4 shadow-soft sm:p-7">
            <div className="rounded-2xl border bg-canvas p-5 sm:p-7">
              <div className="flex items-center justify-between border-b pb-5"><div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-muted">Evidence review</p><p className="mt-1 text-lg font-extrabold">Backend Engineer · CV v3</p></div><span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700">Extraction ready</span></div>
              <div className="mt-6 grid grid-cols-[88px_1fr] gap-4"><div className="grid size-[76px] place-items-center rounded-full border-8 border-accent/20 text-xl font-black">4/5</div><div><p className="font-extrabold">Achievement evidence</p><p className="mt-1 text-sm leading-6 text-muted">Three experience bullets show scope and outcome. Two still describe responsibilities without impact.</p></div></div>
              <blockquote className="mt-6 border-l-2 border-accent pl-4 font-serif text-[15px] leading-6">“Reduced API latency by 38% by introducing request-level caching and query tracing.”</blockquote>
              <div className="mt-6 rounded-xl border border-dashed p-4"><p className="text-xs font-extrabold uppercase tracking-wider text-muted">Suggested next action</p><p className="mt-2 text-sm font-semibold">Add scale and outcome evidence to the payments migration bullet.</p></div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-muted">Illustrative interface — not a real candidate analysis.</p>
        </div>
      </section>

      <section id="method" className="border-y bg-ink py-24 text-canvas sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-[.75fr_1.25fr]"><div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-emerald-300">One continuous system</p><h2 className="mt-4 text-4xl font-black tracking-[-.04em] sm:text-5xl">From document to decision, the context stays intact.</h2></div><p className="max-w-2xl font-serif text-xl leading-8 text-white/65">Most career tools reset at every step. CareerPilot keeps your reviewed evidence connected to each recommendation, job comparison, and interview question.</p></div>
          <ol className="mt-20 divide-y divide-white/15 border-y border-white/15">
            {flow.map((item) => <li key={item.n} className="grid gap-3 py-9 sm:grid-cols-[100px_260px_1fr] sm:items-baseline"><span className="font-mono text-sm text-emerald-300">{item.n}</span><h3 className="text-xl font-extrabold">{item.title}</h3><p className="max-w-2xl leading-7 text-white/60">{item.copy}</p></li>)}
          </ol>
        </div>
      </section>

      <section id="trust" className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-24">
          <div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-accent">Designed for trust</p><h2 className="mt-4 text-4xl font-black tracking-[-.04em] sm:text-5xl">Useful intelligence. Clear boundaries.</h2><p className="mt-6 font-serif text-xl leading-8 text-muted">A CV is personal data, not prompt filler. The system is designed around controlled access, private storage, auditable processing, and your right to correct or delete.</p></div>
          <div className="grid gap-7 sm:grid-cols-2">
            {[{I:ShieldCheck,t:"Quarantine first",c:"Files are private and scanned before downstream processing."},{I:Fingerprint,t:"Evidence lineage",c:"Extracted facts retain source references and confidence."},{I:FileSearch,t:"Honest matching",c:"Relevance explains qualifications, gaps, and unknowns."},{I:MessagesSquare,t:"Controlled AI",c:"Models use narrow tools, validated outputs, and user-scoped context."}].map(({I,t,c}) => <article key={t} className="border-t pt-5"><I className="size-6 text-accent"/><h3 className="mt-4 font-extrabold">{t}</h3><p className="mt-2 text-sm leading-6 text-muted">{c}</p></article>)}
          </div>
        </div>
      </section>

      <section className="mx-auto mb-8 max-w-7xl px-5 sm:px-8"><div className="rounded-[2rem] bg-accent px-6 py-14 text-center text-accent-ink sm:px-16 sm:py-20"><h2 className="text-4xl font-black tracking-[-.04em] sm:text-5xl">Make your evidence work harder.</h2><p className="mx-auto mt-4 max-w-xl text-base opacity-80">Start with one CV. Keep every improvement, opportunity, and practice session connected.</p><Link href="/register" className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-ink px-6 text-sm font-extrabold text-canvas">Create your workspace <ArrowRight className="size-4" /></Link></div></section>
      <footer className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8"><Brand/><p>Coaching for job seekers—not automated hiring decisions.</p></footer>
    </main>
  );
}
