"use client";

import { Suspense, useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Brand } from "./Brand";
import { NavList } from "./NavList";
import { SidebarNav } from "./SidebarNav";
import { WorkspaceNote } from "./WorkspaceNote";

/** Top bar with a slide-in navigation drawer, shown below the `lg` breakpoint. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="lg:hidden print:hidden">
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between bg-slate-950 px-4">
        <Brand />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="rounded-md p-2 text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-amber-500"
        >
          <Menu className="size-5" aria-hidden="true" />
          <span className="sr-only">Open navigation</span>
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-950/60" onClick={close} aria-hidden="true" />
          <nav
            id="mobile-nav"
            aria-label="Primary"
            className="relative flex h-full w-72 max-w-[85vw] flex-col gap-6 bg-slate-950 p-4"
          >
            <div className="flex items-center justify-between">
              <Brand />
              <button
                type="button"
                onClick={close}
                autoFocus
                className="rounded-md p-2 text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-amber-500"
              >
                <X className="size-5" aria-hidden="true" />
                <span className="sr-only">Close navigation</span>
              </button>
            </div>
            <div className="flex-1">
              <Suspense fallback={<NavList onNavigate={close} />}>
                <SidebarNav onNavigate={close} />
              </Suspense>
            </div>
            <WorkspaceNote />
          </nav>
        </div>
      ) : null}
    </div>
  );
}
