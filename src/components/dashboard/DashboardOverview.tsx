"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { CircleCheck, ClipboardList, Eye, Images, Plus, RotateCw } from "lucide-react";
import { DamagedRecordsWarning } from "@/components/inspections/DamagedRecordsWarning";
import { InspectionList, InspectionListSkeleton } from "@/components/inspections/InspectionList";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { useAsyncData, type AsyncState } from "@/hooks/useAsyncData";
import type { Inspection } from "@/lib/domain/types";
import { describeStorageError } from "@/lib/storage/errors";
import { listInspections, type DamagedRecord } from "@/lib/storage/inspections";
import { getWorkspaceSummary, type WorkspaceSummary } from "@/lib/storage/workspace";

interface DashboardData {
  inspections: Inspection[];
  damaged: DamagedRecord[];
  summary: WorkspaceSummary;
}

async function loadDashboard(): Promise<DashboardData> {
  const [list, summary] = await Promise.all([listInspections(), getWorkspaceSummary()]);
  return { inspections: list.inspections, damaged: list.damaged, summary };
}

function statValue(state: AsyncState<DashboardData>, pick: (d: DashboardData) => number): ReactNode {
  if (state.status === "loading") return <Skeleton className="mt-1 h-7 w-10" />;
  if (state.status === "error") return "—";
  return pick(state.data);
}

/**
 * Data-driven part of the dashboard. Server-rendered sections are passed in as
 * slots so only this component ships to the client.
 */
export function DashboardOverview({ main, aside }: { main: ReactNode; aside: ReactNode }) {
  const { state, reload } = useAsyncData(loadDashboard);
  const damaged = state.status === "ready" ? state.data.damaged : [];

  return (
    <>
      {damaged.length > 0 ? <DamagedRecordsWarning records={damaged} onRetry={reload} /> : null}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Inspections"
          value={statValue(state, (d) => d.inspections.length)}
          hint={damaged.length > 0 ? `+${damaged.length} not displayed` : undefined}
          icon={<ClipboardList />}
        />
        <StatCard
          label="Photographs"
          value={statValue(state, (d) => d.summary.photos)}
          icon={<Images />}
          tone="info"
        />
        <StatCard
          label="Open observations"
          value={statValue(state, (d) => d.summary.observations)}
          icon={<Eye />}
          tone="warning"
        />
        <StatCard
          label="Confirmed findings"
          value={statValue(state, (d) => d.summary.confirmedFindings)}
          icon={<CircleCheck />}
          tone="success"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Inspections"
              description={
                state.status === "ready" && state.data.inspections.length > 0
                  ? `${state.data.inspections.length} saved in this browser, most recently updated first.`
                  : "Inspections saved in this browser."
              }
              icon={<ClipboardList />}
            />
            {state.status === "loading" ? (
              <InspectionListSkeleton />
            ) : state.status === "error" ? (
              <CardBody>
                <Callout tone="danger" title="Inspections could not be loaded">
                  <p>{describeStorageError(state.error)}</p>
                  <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
                    <RotateCw aria-hidden="true" />
                    Try again
                  </Button>
                </Callout>
              </CardBody>
            ) : state.data.inspections.length === 0 ? (
              <CardBody>
                <EmptyState
                  icon={<ClipboardList />}
                  // With damaged records present, "No inspections yet" would be untrue.
                  title={damaged.length > 0 ? "No inspections can be displayed" : "No inspections yet"}
                  description={
                    damaged.length > 0
                      ? "Stored records could not be read; see the warning above. You can still create a new inspection."
                      : "Create an inspection to record the site details. It is saved in this browser."
                  }
                  action={
                    <Link href="/inspections/new" className={buttonClasses()}>
                      <Plus aria-hidden="true" />
                      New inspection
                    </Link>
                  }
                />
              </CardBody>
            ) : (
              <InspectionList inspections={state.data.inspections} />
            )}
          </Card>
          {main}
        </div>

        <div className="space-y-6">{aside}</div>
      </div>
    </>
  );
}
