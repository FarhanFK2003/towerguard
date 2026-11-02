import Link from "next/link";
import { HardDrive, Plus, Tags } from "lucide-react";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";
import { StatusDefinitions } from "@/components/dashboard/StatusDefinitions";
import { StorageStatus } from "@/components/dashboard/StorageStatus";
import { WorkflowSteps } from "@/components/dashboard/WorkflowSteps";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { buttonClasses } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";

export default function DashboardPage() {
  return (
    <PageContainer className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Inspection dashboard"
        description="Document visible conditions on telecom towers and steel structures with photographs, annotated evidence and inspector-reviewed observations."
        actions={
          <Link href="/inspections/new" className={buttonClasses()}>
            <Plus aria-hidden="true" />
            New inspection
          </Link>
        }
      />

      <DashboardOverview
        main={
          <Card>
            <CardHeader
              title="Inspection workflow"
              description="From site photographs to an evidence-backed report."
            />
            <CardBody>
              <WorkflowSteps />
            </CardBody>
          </Card>
        }
        aside={
          <>
            <Callout tone="warning" title="Scope of this tool">
              TowerGuard AI supports visual documentation only. All observations are entered and
              reviewed by the inspector; no automated image analysis is active. Reports do not
              constitute a structural or engineering assessment.
            </Callout>

            <Card>
              <CardHeader title="Status definitions" icon={<Tags />} />
              <CardBody>
                <StatusDefinitions />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Local storage"
                description="Photographs and records stay in this browser."
                icon={<HardDrive />}
              />
              <CardBody>
                <StorageStatus />
              </CardBody>
            </Card>
          </>
        }
      />
    </PageContainer>
  );
}
