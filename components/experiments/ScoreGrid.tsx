"use client";

import type { ExperimentScores } from "@/types";

const scoreFields: Array<{ key: keyof ExperimentScores; label: string }> = [
  { key: "centerSharpness", label: "Center sharpness" },
  { key: "thirdsUsability", label: "Thirds usability" },
  { key: "edgeSwirl", label: "Edge swirl" },
  { key: "glow", label: "Glow" },
  { key: "flareWarmth", label: "Flare warmth" },
  { key: "flareControl", label: "Flare control" },
  { key: "caUgliness", label: "CA ugliness" },
  { key: "stopDownCleanup", label: "Stop-down cleanup" },
  { key: "mechanicalReliability", label: "Mechanical reliability" }
];

export function ScoreGrid({
  value,
  onChange
}: {
  value: ExperimentScores;
  onChange: (next: ExperimentScores) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {scoreFields.map((field) => (
        <label key={field.key} className="grid grid-cols-[170px_1fr_40px] items-center gap-2 text-sm text-labMuted">
          <span>{field.label}</span>
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={value[field.key]}
            onChange={(event) =>
              onChange({
                ...value,
                [field.key]: Number(event.target.value)
              })
            }
            className="accent-labAccent"
          />
          <span className="text-right text-labText">{value[field.key]}</span>
        </label>
      ))}
    </div>
  );
}
