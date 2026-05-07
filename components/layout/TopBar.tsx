"use client";

import type { ReactNode } from "react";

export function TopBar({
  title,
  projectName,
  actions
}: {
  title: string;
  projectName?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-center justify-between rounded-2xl border border-labBorder bg-labPanel p-4 shadow-panel">
      <div>
        <h2 className="text-lg font-semibold tracking-wide text-labText">{title}</h2>
        {projectName && <p className="text-sm text-labMuted">{projectName}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
    </header>
  );
}
