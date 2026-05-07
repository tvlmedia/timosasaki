"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { FocusTravelPanel } from "@/components/focus/FocusTravelPanel";
import { ProjectModuleNav } from "@/components/projects/ProjectModuleNav";
import { exportProjectJson, getProject, saveProject } from "@/lib/storage";
import type { LensProject } from "@/types";

export default function FocusTravelPage() {
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

  if (loading) {
    return (
      <AppShell title="Focus Travel / Mount Conversion">
        <div className="panel p-4">
          <p className="text-labMuted">Loading project...</p>
        </div>
      </AppShell>
    );
  }

  if (!project) {
    return (
      <AppShell title="Focus Travel / Mount Conversion">
        <div className="panel p-4">
          <p className="text-labMuted">Project not found.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Focus Travel / Mount Conversion"
      projectName={project.name}
      actions={
        <ProjectModuleNav
          projectId={project.id}
          active="focus_travel"
          onExport={() => exportProjectJson(project)}
        />
      }
    >
      <FocusTravelPanel
        project={project}
        onProjectChange={(nextProject) => {
          const saved = saveProject({
            ...nextProject,
            updatedAt: new Date().toISOString()
          });
          setProject(saved);
        }}
      />
    </AppShell>
  );
}
