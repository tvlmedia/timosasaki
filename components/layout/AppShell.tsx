"use client";

import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

export function AppShell({
  title,
  projectName,
  actions,
  children
}: {
  title: string;
  projectName?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-labBg text-labText">
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-6">
          <TopBar title={title} projectName={projectName} actions={actions} />
          <div>{children}</div>
        </main>
      </div>
    </div>
  );
}
