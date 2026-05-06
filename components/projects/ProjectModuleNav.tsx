"use client";

import Link from "next/link";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/common/Button";
import {
  projectCadHref,
  projectDetailHref,
  projectExperimentsHref,
  projectMeasurementsHref,
  projectStackHref
} from "@/lib/routes";
import { importProjectJson, saveProject } from "@/lib/storage";

type ProjectModule = "project" | "measurements" | "stack" | "cad" | "experiments";

const links: Array<{ key: ProjectModule; label: string; href: (id: string) => string }> = [
  { key: "project", label: "Project", href: projectDetailHref },
  { key: "measurements", label: "Measurements", href: projectMeasurementsHref },
  { key: "stack", label: "Stack", href: projectStackHref },
  { key: "cad", label: "CAD", href: projectCadHref },
  { key: "experiments", label: "Experiments", href: projectExperimentsHref }
];

export function ProjectModuleNav({
  projectId,
  active,
  onExport
}: {
  projectId: string;
  active: ProjectModule;
  onExport?: () => void;
}) {
  const router = useRouter();
  const importInputRef = useRef<HTMLInputElement>(null);

  const onImport = async (file?: File) => {
    if (!file) return;
    try {
      const raw = await file.text();
      const imported = importProjectJson(raw);
      const saved = saveProject(imported);
      router.push(projectDetailHref(saved.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed.";
      window.alert(`Import JSON failed: ${message}`);
    }
  };

  return (
    <>
      {links.map((link) => (
        <Link key={link.key} href={link.href(projectId)}>
          <Button variant={active === link.key ? "primary" : "secondary"}>{link.label}</Button>
        </Link>
      ))}
      {onExport && <Button onClick={onExport}>Export JSON</Button>}
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
  );
}
