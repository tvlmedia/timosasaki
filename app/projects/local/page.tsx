"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { TargetLookRadar } from "@/components/projects/TargetLookRadar";
import {
  projectCadHref,
  projectExperimentsHref,
  projectMeasurementsHref,
  projectStackHref
} from "@/lib/routes";
import {
  getLargestGlassDiameter,
  getRecommendedBarrelInnerDiameter,
  getRecommendedBarrelOuterDiameter,
  getTotalStackLength
} from "@/lib/calculations";
import { exportProjectJson, getProject, saveProject } from "@/lib/storage";
import type { LensProject } from "@/types";

export default function ProjectDetailPage() {
  const [project, setProject] = useState<LensProject | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const projectId = new URLSearchParams(window.location.search).get("projectId") ?? "";
    if (!projectId) {
      setProject(null);
      setLoading(false);
      return;
    }
    const found = getProject(projectId);
    setProject(found ?? null);
    setLoading(false);
  }, []);

  const patchAndSave = (updater: (project: LensProject) => LensProject) => {
    setProject((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      return saveProject({
        ...next,
        updatedAt: new Date().toISOString()
      });
    });
  };

  if (loading) {
    return (
      <AppShell title="Project">
        <div className="panel p-5">
          <p className="text-labMuted">Loading project...</p>
        </div>
      </AppShell>
    );
  }

  if (!project) {
    return (
      <AppShell title="Project">
        <div className="panel p-5">
          <p className="text-labMuted">Project not found.</p>
          <Link href="/" className="mt-3 inline-flex">
            <Button variant="primary">Back to Dashboard</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const totalLength = getTotalStackLength(project.stackItems);
  const largestGlass = getLargestGlassDiameter(project.stackItems);
  const recommendedInner = getRecommendedBarrelInnerDiameter(project.stackItems, project.cadDefaults);
  const recommendedOuter = getRecommendedBarrelOuterDiameter(project.stackItems, project.cadDefaults);

  return (
    <AppShell
      title="Project Detail"
      projectName={project.name}
      actions={<Button onClick={() => exportProjectJson(project)}>Export JSON</Button>}
    >
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="panel space-y-3 p-4">
            <h3 className="text-base font-semibold">Project</h3>
            <Input
              label="Project name"
              value={project.name}
              onChange={(event) => patchAndSave((entry) => ({ ...entry, name: event.target.value }))}
            />
            <Input
              label="Donor lens"
              value={project.donorLens ?? ""}
              onChange={(event) => patchAndSave((entry) => ({ ...entry, donorLens: event.target.value }))}
            />
            <label className="flex flex-col gap-1 text-sm text-labMuted">
              <span>Notes</span>
              <textarea
                className="min-h-28 rounded-xl border border-labBorder bg-[#090909] px-3 py-2 text-labText outline-none focus:border-labAccent"
                value={project.notes}
                onChange={(event) => patchAndSave((entry) => ({ ...entry, notes: event.target.value }))}
              />
            </label>
          </div>

          <TargetLookRadar
            value={project.targetLook}
            onChange={(targetLook) => patchAndSave((entry) => ({ ...entry, targetLook }))}
          />
        </div>

        <div className="space-y-4">
          <div className="panel p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-labMuted">Stack Summary</h3>
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-labMuted">Stack items</span>
                <span className="mono">{project.stackItems.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-labMuted">Total stack length</span>
                <span className="mono">{totalLength.toFixed(2)} mm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-labMuted">Largest glass diameter</span>
                <span className="mono">{largestGlass.toFixed(2)} mm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-labMuted">Recommended barrel ID</span>
                <span className="mono">{recommendedInner.toFixed(2)} mm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-labMuted">Recommended barrel OD</span>
                <span className="mono">{recommendedOuter.toFixed(2)} mm</span>
              </div>
            </div>
          </div>

          <div className="panel grid gap-2 p-4">
            <Link href={projectStackHref(project.id)} className="inline-flex">
              <Button variant="primary" className="w-full">
                Edit Stack
              </Button>
            </Link>
            <Link href={projectCadHref(project.id)} className="inline-flex">
              <Button className="w-full">Generate CAD</Button>
            </Link>
            <Link href={projectExperimentsHref(project.id)} className="inline-flex">
              <Button className="w-full">Add Experiment</Button>
            </Link>
            <Link href={projectMeasurementsHref(project.id)} className="inline-flex">
              <Button className="w-full">Measurements</Button>
            </Link>
            <Button onClick={() => exportProjectJson(project)}>Export JSON</Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
