"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/common/Button";
import { StackBuilder } from "@/components/stack/StackBuilder";
import { projectDetailHref } from "@/lib/routes";
import { exportProjectJson, getProject, saveProject } from "@/lib/storage";
import type { LensProject } from "@/types";

export default function StackPage() {
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

  if (loading) {
    return (
      <AppShell title="Stack Builder">
        <div className="panel p-4">
          <p className="text-labMuted">Loading project...</p>
        </div>
      </AppShell>
    );
  }

  if (!project) {
    return (
      <AppShell title="Stack Builder">
        <div className="panel p-4">
          <p className="text-labMuted">Project not found.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Stack Builder"
      projectName={project.name}
      actions={
        <>
          <Link href={projectDetailHref(project.id)}>
            <Button>Project</Button>
          </Link>
          <Button onClick={() => exportProjectJson(project)}>Export JSON</Button>
        </>
      }
    >
      <StackBuilder
        project={project}
        onProjectChange={(next) => {
          const saved = saveProject(next);
          setProject(saved);
        }}
      />
    </AppShell>
  );
}
