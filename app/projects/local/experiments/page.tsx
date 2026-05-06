"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/common/Button";
import { ExperimentCard } from "@/components/experiments/ExperimentCard";
import { ExperimentForm } from "@/components/experiments/ExperimentForm";
import { projectDetailHref } from "@/lib/routes";
import { getProject, saveProject } from "@/lib/storage";
import type { Experiment, LensProject } from "@/types";

export default function ExperimentsPage() {
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
        <Link href={projectDetailHref(project.id)}>
          <Button>Project</Button>
        </Link>
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
