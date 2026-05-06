"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/common/Button";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { projectDetailHref } from "@/lib/routes";
import { importProjectJson, saveProject, getProjects, exportProjectJson, deleteProject, duplicateProject } from "@/lib/storage";
import type { LensProject } from "@/types";

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<LensProject[]>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [importError, setImportError] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    setProjects(getProjects());
  };

  useEffect(() => {
    refresh();
  }, []);

  const onImport = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      const project = importProjectJson(text);
      saveProject(project);
      refresh();
      setImportError("");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import failed.");
    }
  };

  return (
    <AppShell
      title="Timo Sasaki Lens Lab"
      actions={
        <>
          <Button variant="primary" onClick={() => setShowNewForm((prev) => !prev)}>
            New Project
          </Button>
          <Button onClick={() => importInputRef.current?.click()}>Import JSON</Button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              void onImport(file);
              event.target.value = "";
            }}
          />
        </>
      }
    >
      <div className="mb-6 rounded-2xl border border-labBorder bg-labPanel p-5">
        <p className="text-sm uppercase tracking-[0.24em] text-labMuted">Prototype. Print. Test. Tune.</p>
        <p className="mt-2 text-sm text-labMuted">
          Physical prototyping workflow for cine lens modding: donor measurements to stack, parametric part CAD,
          print, camera test, and next iteration.
        </p>
      </div>

      {showNewForm && (
        <div className="mb-6">
          <ProjectForm
            onCreated={(project) => {
              refresh();
              setShowNewForm(false);
              router.push(projectDetailHref(project.id));
            }}
          />
        </div>
      )}

      {importError && <p className="mb-4 text-sm text-labDanger">{importError}</p>}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onExport={exportProjectJson}
            onDuplicate={(target) => {
              const duplicated = duplicateProject(target.id);
              refresh();
              if (duplicated) router.push(projectDetailHref(duplicated.id));
            }}
            onDelete={(target) => {
              const ok = window.confirm(`Delete project "${target.name}"?`);
              if (!ok) return;
              deleteProject(target.id);
              refresh();
            }}
          />
        ))}
      </section>
    </AppShell>
  );
}
