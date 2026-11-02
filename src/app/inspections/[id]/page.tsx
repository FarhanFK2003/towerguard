import { Suspense } from "react";
import type { Metadata } from "next";
import {
  InspectionOverview,
  InspectionOverviewSkeleton,
} from "@/components/inspections/InspectionOverview";
import { PageContainer } from "@/components/layout/PageContainer";

export const metadata: Metadata = {
  title: "Inspection",
};

/**
 * Inspection data lives in the browser (IndexedDB), so the server only renders
 * a static shell; the ID is runtime data and must be read inside Suspense
 * because Cache Components is enabled.
 */
export default function InspectionPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageContainer>
      <Suspense fallback={<InspectionOverviewSkeleton />}>
        {params.then(({ id }) => (
          <InspectionOverview inspectionId={id} />
        ))}
      </Suspense>
    </PageContainer>
  );
}
