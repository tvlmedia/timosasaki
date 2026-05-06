"use client";

import Link from "next/link";
import { Button } from "@/components/common/Button";
import type { LensProject } from "@/types";

export function ProjectCard({
  project,
  onExport,
  onDuplicate,
  onDelete
}: {
  project: LensProject;
  onExport: (project: LensProject) => void;
  onDuplicate: (project: LensProject) => void;
  onDelete: (project: LensProject) => void;
}) {
  return (
    <article className="panel p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-labText">{project.name}</h3>
          <p className="text-sm text-labMuted">{project.donorLens || "Donor lens not set"}</p>
        </div>
        <span className="rounded-lg border border-labBorder bg-[#0a0a0a] px-2 py-1 text-xs text-labMuted">
          {project.targetFormat || "Format n/a"}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 text-sm text-labMuted">
        <div>Stack items: {project.stackItems.length}</div>
        <div>Experiments: {project.experiments.length}</div>
        <div className="col-span-2">
          Updated: {new Date(project.updatedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link href={`/projects/${project.id}`} className="inline-flex">
          <Button variant="primary" className="w-full">
            Open
          </Button>
        </Link>
        <Button onClick={() => onExport(project)}>Export JSON</Button>
        <Button onClick={() => onDuplicate(project)}>Duplicate</Button>
        <Button variant="danger" onClick={() => onDelete(project)}>
          Delete
        </Button>
      </div>
    </article>
  );
}
