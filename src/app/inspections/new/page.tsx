import type { Metadata } from "next";
import { InspectionForm } from "@/components/inspections/InspectionForm";
import { BackLink } from "@/components/layout/BackLink";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = {
  title: "New inspection",
};

export default function NewInspectionPage() {
  return (
    <PageContainer>
      <div className="mx-auto max-w-4xl space-y-6">
        <BackLink href="/">Dashboard</BackLink>
        <PageHeader
          eyebrow="Inspections"
          title="New inspection"
          description="Record the site and inspection details. Fields marked * are required. The inspection is saved in this browser."
        />
        <InspectionForm />
      </div>
    </PageContainer>
  );
}
