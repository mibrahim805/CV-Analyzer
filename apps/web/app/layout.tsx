import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CareerPilot — Build a career with evidence", template: "%s · CareerPilot" },
  description: "Understand your CV, discover genuine opportunities, and practice role-specific interviews.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
