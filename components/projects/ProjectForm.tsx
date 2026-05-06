"use client";

import { useState } from "react";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { Select } from "@/components/common/Select";
import type { LensProject } from "@/types";
import { createEmptyProject, saveProject } from "@/lib/storage";

export function ProjectForm({ onCreated }: { onCreated: (project: LensProject) => void }) {
  const [name, setName] = useState("");
  const [donorLens, setDonorLens] = useState("");
  const [targetFormat, setTargetFormat] = useState<LensProject["targetFormat"]>("FULL_FRAME");
  const [targetMount, setTargetMount] = useState<LensProject["targetMount"]>("PL");
  const [error, setError] = useState("");

  const createProject = () => {
    if (!name.trim()) {
      setError("Project name is required.");
      return;
    }

    const base = createEmptyProject(name);
    const project = saveProject({
      ...base,
      donorLens: donorLens.trim(),
      targetFormat,
      targetMount
    });
    onCreated(project);
    setName("");
    setDonorLens("");
    setError("");
  };

  return (
    <div className="panel space-y-3 p-4">
      <h3 className="text-base font-semibold">New Project</h3>
      <Input label="Project Name" value={name} onChange={(event) => setName(event.target.value)} error={error} />
      <Input
        label="Donor Lens"
        value={donorLens}
        onChange={(event) => setDonorLens(event.target.value)}
        placeholder="Helios 44-2"
      />
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Target Format"
          value={targetFormat}
          onChange={(event) => setTargetFormat(event.target.value as LensProject["targetFormat"])}
        >
          <option value="S16">S16</option>
          <option value="S35">S35</option>
          <option value="FULL_FRAME">FULL_FRAME</option>
          <option value="65MM">65MM</option>
          <option value="CUSTOM">CUSTOM</option>
        </Select>
        <Select
          label="Target Mount"
          value={targetMount}
          onChange={(event) => setTargetMount(event.target.value as LensProject["targetMount"])}
        >
          <option value="PL">PL</option>
          <option value="LPL">LPL</option>
          <option value="EF">EF</option>
          <option value="E">E</option>
          <option value="M42">M42</option>
          <option value="CUSTOM">CUSTOM</option>
        </Select>
      </div>
      <Button variant="primary" onClick={createProject}>
        New Project
      </Button>
    </div>
  );
}
