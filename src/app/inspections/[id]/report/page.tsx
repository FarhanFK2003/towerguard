import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/PageContainer";
import { ReportView } from "@/components/report/ReportView";

export const metadata: Metadata = {
  title: "Inspection report",
};

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageContainer className="print:max-w-none print:p-0">
      <div className="mx-auto max-w-5xl print:max-w-none">
        <Suspense fallback={null}>{params.then(({ id }) => <ReportView inspectionId={id} />)}</Suspense>
      </div>
    </PageContainer>
  );
}
