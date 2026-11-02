import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default function NotFound() {
  return (
    <PageContainer>
      <EmptyState
        className="bg-white py-20"
        icon={<SearchX />}
        title="Page not found"
        description="The page you requested does not exist or is not available yet."
        action={
          <Link href="/" className={buttonClasses({ variant: "secondary" })}>
            <ArrowLeft aria-hidden="true" />
            Back to dashboard
          </Link>
        }
      />
    </PageContainer>
  );
}
