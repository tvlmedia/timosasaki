"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ProjectModuleNav } from "@/components/projects/ProjectModuleNav";
import { ExperimentCard } from "@/components/experiments/ExperimentCard";
import { ExperimentForm } from "@/components/experiments/ExperimentForm";
import { exportProjectJson, getProject, saveProject } from "@/lib/storage";
import type { Experiment, LensProject } from "@/types";

export default function ExperimentsPage() {
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
      <AppShell title="Experiments">
        <div className="panel p-4">
          <p className="text-labMuted">Loading project...</p>
        </div>
      </AppShell>
    );
  }

  if (!project) {
    return (
      <AppShell title="Experiments">
        <div className="panel p-4">
          <p className="text-labMuted">Project not found.</p>
        </div>
      </AppShell>
    );
  }

  const addExperiment = (experiment: Experiment) => {
    const saved = saveProject({
      ...project,
      experiments: [experiment, ...project.experiments],
      updatedAt: new Date().toISOString()
    });
    setProject(saved);
  };

  return (
    <AppShell
      title="Experiments"
      projectName={project.name}
      actions={
        <ProjectModuleNav
          projectId={project.id}
          active="experiments"
          onExport={() => exportProjectJson(project)}
        />
      }
    >
      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <ExperimentForm onAdd={addExperiment} />
        <section className="space-y-3">
          {project.experiments.length === 0 && (
            <div className="panel p-4 text-sm text-labMuted">
              No experiments yet. Add your first camera test and iteration notes.
            </div>
          )}
          {project.experiments.map((experiment) => (
            <ExperimentCard key={experiment.id} experiment={experiment} />
          ))}
        </section>
      </div>
    </AppShell>
  );
}
