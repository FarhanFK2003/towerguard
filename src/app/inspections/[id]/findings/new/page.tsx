import { Suspense } from "react";
import type { Metadata } from "next";
import { FindingEditor } from "@/components/findings/FindingEditor";
import { PageContainer } from "@/components/layout/PageContainer";

export const metadata: Metadata = {
  title: "New finding",
};

type SearchParams = Record<string, string | string[] | undefined>;
const single = (value: string | string[] | undefined) => (typeof value === "string" && value !== "" ? value : undefined);

/** `?photo=…&annotation=…` pre-links evidence (used by "Create finding from annotation"). */
export default function NewFindingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  return (
    <PageContainer>
      <Suspense fallback={null}>
        {Promise.all([params, searchParams]).then(([{ id }, query]) => (
          <FindingEditor
            inspectionId={id}
            initialPhotoId={single(query.photo)}
            initialAnnotationId={single(query.annotation)}
          />
        ))}
      </Suspense>
    </PageContainer>
  );
}
