import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/PageContainer";
import { PhotoViewer, PhotoViewerSkeleton } from "@/components/photos/PhotoViewer";

export const metadata: Metadata = {
  title: "Photograph",
};

/** Photo data lives in IndexedDB; the IDs are runtime data, read inside Suspense. */
export default function PhotoPage({ params }: { params: Promise<{ id: string; photoId: string }> }) {
  return (
    <PageContainer>
      <Suspense fallback={<PhotoViewerSkeleton />}>
        {params.then(({ id, photoId }) => (
          <PhotoViewer inspectionId={id} photoId={photoId} />
        ))}
      </Suspense>
    </PageContainer>
  );
}
