import { Suspense, type ReactNode } from "react";
import { Brand } from "./Brand";
import { MobileNav } from "./MobileNav";
import { NavList } from "./NavList";
import { SidebarNav } from "./SidebarNav";
import { WorkspaceNote } from "./WorkspaceNote";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-slate-950 lg:flex">
        <div className="border-b border-white/10 px-5 py-5">
          <Brand />
        </div>
        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Workspace
          </p>
          <Suspense fallback={<NavList />}>
            <SidebarNav />
          </Suspense>
        </nav>
        <div className="p-3">
          <WorkspaceNote />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        <main id="main" className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
