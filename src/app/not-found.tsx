import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { buttonClasses } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <PageContainer>
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-6 py-20 text-center">
        <span
          className="flex size-12 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200 [&_svg]:size-6"
          aria-hidden="true"
        >
          <SearchX />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-slate-900">Page not found</h1>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          This address does not match any page in TowerGuard. Check the link, or return to the dashboard to find
          your inspections.
        </p>
        <Link href="/" className={buttonClasses({ variant: "secondary", className: "mt-5" })}>
          <ArrowLeft aria-hidden="true" />
          Back to dashboard
        </Link>
      </div>
    </PageContainer>
  );
}
