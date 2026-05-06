"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ProjectModuleNav } from "@/components/projects/ProjectModuleNav";
import { WarningBox } from "@/components/common/WarningBox";
import { CadGeneratorPanel } from "@/components/cad/CadGeneratorPanel";
import { exportProjectJson, getProject } from "@/lib/storage";
import type { LensProject } from "@/types";

export default function CadPage() {
  const [project, setProject] = useState<LensProject | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const projectId = new URLSearchParams(window.location.search).get("projectId") ?? "";
    if (!projectId) {
      setProject(null);
      setLoading(false);
      return;
    }
    setProject(getProject(projectId) ?? null);
    setLoading(false);
  }, []);

  const warnings = useMemo(() => {
    const base = [
      "CAD output is a starting point for prototyping.",
      "Do not trust generated parts blindly.",
      "Check: glass cannot fall out.",
      "Check: retaining lips do not touch optical clear aperture.",
      "Check: mount/flange depth.",
      "Check: camera clearance.",
      "Check: material strength.",
      "Check: screw positions.",
      "Check: print tolerances.",
      "Check: heat/warping."
    ];
    if (project?.targetMount === "PL") {
      base.push(
        "Do not use a 3D printed PL mount as a final load-bearing mount for valuable cameras/lenses. Use only for rough fit tests unless properly engineered."
      );
    }
    return base;
  }, [project?.targetMount]);

  if (loading) {
    return (
      <AppShell title="CAD Generator">
        <div className="panel p-4">
          <p className="text-labMuted">Loading project...</p>
        </div>
      </AppShell>
    );
  }

  if (!project) {
    return (
      <AppShell title="CAD Generator">
        <div className="panel p-4">
          <p className="text-labMuted">Project not found.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="CAD Generator"
      projectName={project.name}
      actions={
        <ProjectModuleNav
          projectId={project.id}
          active="cad"
          onExport={() => exportProjectJson(project)}
        />
      }
    >
      <div className="mb-4">
        <WarningBox title="Prototype Geometry Warning" lines={warnings} />
      </div>
      <CadGeneratorPanel project={project} />
    </AppShell>
  );
}
