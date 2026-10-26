import Link from "next/link";

export function Brand() {
  return (
    <Link href="/" className="dashboard-focus inline-flex items-center gap-2.5 rounded-lg" aria-label="CareerPilot home">
      <span className="relative grid size-9 place-items-center overflow-hidden rounded-xl bg-accent text-[11px] font-black text-accent-ink shadow-[0_8px_22px_hsl(var(--accent)/.2)]">
        <span className="absolute -right-2 -top-2 size-6 rounded-full border border-accent-ink/25" aria-hidden="true" />
        <span className="relative">CP</span>
      </span>
      <span className="text-[15px] font-black tracking-[-0.03em] text-ink">CareerPilot</span>
    </Link>
  );
}
