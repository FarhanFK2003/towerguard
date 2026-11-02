import { CircleCheck, ClipboardList, Eye, HardDrive, Images, Plus, Tags } from "lucide-react";
import { StatusDefinitions } from "@/components/dashboard/StatusDefinitions";
import { StorageStatus } from "@/components/dashboard/StorageStatus";
import { WorkflowSteps } from "@/components/dashboard/WorkflowSteps";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";

// Statistics show "—" until the storage layer is connected; no placeholder numbers.
const NOT_CONNECTED = "—";

export default function DashboardPage() {
  return (
    <PageContainer className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Inspection dashboard"
        description="Document visible conditions on telecom towers and steel structures with photographs, annotated evidence and inspector-reviewed observations."
        actions={
          <Button disabled title="Inspection creation is not available yet">
            <Plus aria-hidden="true" />
            New inspection
          </Button>
        }
      />

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Inspections" value={NOT_CONNECTED} icon={<ClipboardList />} />
        <StatCard label="Photographs" value={NOT_CONNECTED} icon={<Images />} tone="info" />
        <StatCard label="Open observations" value={NOT_CONNECTED} icon={<Eye />} tone="warning" />
        <StatCard
          label="Confirmed findings"
          value={NOT_CONNECTED}
          icon={<CircleCheck />}
          tone="success"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Recent inspections"
              description="Inspections saved in this browser."
              icon={<ClipboardList />}
            />
            <CardBody>
              <EmptyState
                icon={<ClipboardList />}
                title="No inspections yet"
                description="Create an inspection to start uploading tower photographs and documenting observations."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Inspection workflow"
              description="From site photographs to an evidence-backed report."
            />
            <CardBody>
              <WorkflowSteps />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
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
        </div>
      </div>
    </PageContainer>
  );
}
