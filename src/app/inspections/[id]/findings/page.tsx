import { Suspense } from "react";
import type { Metadata } from "next";
import { FindingsList } from "@/components/findings/FindingsList";
import { PageContainer } from "@/components/layout/PageContainer";

export const metadata: Metadata = {
  title: "Findings",
};

export default function FindingsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageContainer>
      <Suspense fallback={null}>{params.then(({ id }) => <FindingsList inspectionId={id} />)}</Suspense>
    </PageContainer>
  );
}
