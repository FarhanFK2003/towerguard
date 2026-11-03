import { Suspense } from "react";
import type { Metadata } from "next";
import { FindingEditor } from "@/components/findings/FindingEditor";
import { PageContainer } from "@/components/layout/PageContainer";

export const metadata: Metadata = {
  title: "Finding",
};

export default function FindingPage({ params }: { params: Promise<{ id: string; findingId: string }> }) {
  return (
    <PageContainer>
      <Suspense fallback={null}>
        {params.then(({ id, findingId }) => (
          <FindingEditor inspectionId={id} findingId={findingId} />
        ))}
      </Suspense>
    </PageContainer>
  );
}
