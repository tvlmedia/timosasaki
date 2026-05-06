"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/common/Button";
import { WarningBox } from "@/components/common/WarningBox";
import { CadGeneratorPanel } from "@/components/cad/CadGeneratorPanel";
import { projectDetailHref } from "@/lib/routes";
import { getProject } from "@/lib/storage";
import type { LensProject } from "@/types";

export default function CadPage() {
  const searchParams = useSearchParams();
  const [project, setProject] = useState<LensProject | null>(null);
  const [loading, setLoading] = useState(true);
  const projectId = searchParams.get("projectId") ?? "";

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      setLoading(false);
      return;
    }
    setProject(getProject(projectId) ?? null);
    setLoading(false);
  }, [projectId]);

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
        <Link href={projectDetailHref(project.id)}>
          <Button>Project</Button>
        </Link>
      }
    >
      <div className="mb-4">
        <WarningBox title="Prototype Geometry Warning" lines={warnings} />
      </div>
      <CadGeneratorPanel project={project} />
    </AppShell>
  );
}
