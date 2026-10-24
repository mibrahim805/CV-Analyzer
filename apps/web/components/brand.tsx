import Link from "next/link";

export function Brand() {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent" aria-label="CareerPilot home">
      <span className="grid size-9 place-items-center rounded-xl bg-ink text-sm font-black text-canvas">CP</span>
      <span className="text-[15px] font-extrabold tracking-[-0.02em]">CareerPilot</span>
    </Link>
  );
}
