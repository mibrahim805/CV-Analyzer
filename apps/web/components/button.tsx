import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn("inline-flex h-11 items-center justify-center rounded-xl bg-ink px-5 text-sm font-bold text-canvas transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transform-none", className)} {...props} />;
}
