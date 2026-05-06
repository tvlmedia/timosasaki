"use client";

import { useState } from "react";
import { createId } from "@/lib/ids";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { ScoreGrid } from "@/components/experiments/ScoreGrid";
import { TestFrameUploader } from "@/components/experiments/TestFrameUploader";
import type { Experiment, ExperimentScores, TestImage } from "@/types";

const defaultScores: ExperimentScores = {
  centerSharpness: 5,
  thirdsUsability: 5,
  edgeSwirl: 5,
  glow: 5,
  flareWarmth: 5,
  flareControl: 5,
  caUgliness: 5,
  stopDownCleanup: 5,
  mechanicalReliability: 5
};

export function ExperimentForm({ onAdd }: { onAdd: (experiment: Experiment) => void }) {
  const [name, setName] = useState("");
  const [buildVersion, setBuildVersion] = useState("");
  const [goal, setGoal] = useState("");
  const [changesRaw, setChangesRaw] = useState("");
  const [printNotes, setPrintNotes] = useState("");
  const [cameraTestNotes, setCameraTestNotes] = useState("");
  const [scores, setScores] = useState<ExperimentScores>({ ...defaultScores });
  const [conclusion, setConclusion] = useState("");
  const [nextStepsRaw, setNextStepsRaw] = useState("");
  const [images, setImages] = useState<TestImage[]>([]);
  const [error, setError] = useState("");

  const submit = () => {
    if (!name.trim()) {
      setError("Experiment name is required.");
      return;
    }
    if (!goal.trim()) {
      setError("Goal is required.");
      return;
    }

    const experiment: Experiment = {
      id: createId("experiment"),
      name: name.trim(),
      date: new Date().toISOString(),
      buildVersion: buildVersion.trim() || undefined,
      goal: goal.trim(),
      changes: changesRaw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      printNotes: printNotes.trim() || undefined,
      cameraTestNotes: cameraTestNotes.trim() || undefined,
      scores,
      images,
      conclusion: conclusion.trim(),
      nextSteps: nextStepsRaw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    };

    onAdd(experiment);
    setName("");
    setBuildVersion("");
    setGoal("");
    setChangesRaw("");
    setPrintNotes("");
    setCameraTestNotes("");
    setScores({ ...defaultScores });
    setConclusion("");
    setNextStepsRaw("");
    setImages([]);
    setError("");
  };

  return (
    <div className="panel space-y-3 p-4">
      <h3 className="text-base font-semibold">Add Experiment</h3>
      <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} error={error} />
      <Input
        label="Build version"
        value={buildVersion}
        onChange={(event) => setBuildVersion(event.target.value)}
        placeholder="V1.2"
      />
      <label className="flex flex-col gap-1 text-sm text-labMuted">
        <span>Goal</span>
        <textarea
          className="min-h-20 rounded-xl border border-labBorder bg-[#090909] px-3 py-2 text-labText outline-none focus:border-labAccent"
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-labMuted">
        <span>Changes (one per line)</span>
        <textarea
          className="min-h-20 rounded-xl border border-labBorder bg-[#090909] px-3 py-2 text-labText outline-none focus:border-labAccent"
          value={changesRaw}
          onChange={(event) => setChangesRaw(event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-labMuted">
        <span>Print notes</span>
        <textarea
          className="min-h-20 rounded-xl border border-labBorder bg-[#090909] px-3 py-2 text-labText outline-none focus:border-labAccent"
          value={printNotes}
          onChange={(event) => setPrintNotes(event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-labMuted">
        <span>Camera test notes</span>
        <textarea
          className="min-h-20 rounded-xl border border-labBorder bg-[#090909] px-3 py-2 text-labText outline-none focus:border-labAccent"
          value={cameraTestNotes}
          onChange={(event) => setCameraTestNotes(event.target.value)}
        />
      </label>

      <div>
        <p className="mb-2 text-sm text-labMuted">Scores (0-10)</p>
        <ScoreGrid value={scores} onChange={setScores} />
      </div>

      <label className="flex flex-col gap-1 text-sm text-labMuted">
        <span>Conclusion</span>
        <textarea
          className="min-h-20 rounded-xl border border-labBorder bg-[#090909] px-3 py-2 text-labText outline-none focus:border-labAccent"
          value={conclusion}
          onChange={(event) => setConclusion(event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-labMuted">
        <span>Next steps (one per line)</span>
        <textarea
          className="min-h-20 rounded-xl border border-labBorder bg-[#090909] px-3 py-2 text-labText outline-none focus:border-labAccent"
          value={nextStepsRaw}
          onChange={(event) => setNextStepsRaw(event.target.value)}
        />
      </label>

      <TestFrameUploader images={images} onChange={setImages} />

      <Button variant="primary" onClick={submit}>
        Add Experiment
      </Button>
    </div>
  );
}
