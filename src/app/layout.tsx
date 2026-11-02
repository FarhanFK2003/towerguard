import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TowerGuard AI",
    template: "%s · TowerGuard AI",
  },
  description:
    "Evidence-based visual inspection and damage documentation for telecom towers and steel structures.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
