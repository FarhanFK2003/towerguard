import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/product";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: PRODUCT_NAME,
    template: `%s · ${PRODUCT_NAME}`,
  },
  description: `${PRODUCT_TAGLINE}: evidence-linked visual inspection documentation for telecom towers and steel structures.`,
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
