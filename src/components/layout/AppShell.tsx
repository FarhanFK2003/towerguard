import { Suspense, type ReactNode } from "react";
import { Brand } from "./Brand";
import { MobileNav } from "./MobileNav";
import { NavList } from "./NavList";
import { SidebarNav } from "./SidebarNav";
import { WorkspaceNote } from "./WorkspaceNote";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-900 focus:shadow-lg focus:outline-2 focus:outline-amber-500 print:hidden"
      >
        Skip to main content
      </a>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-slate-950 lg:flex print:hidden">
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
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
