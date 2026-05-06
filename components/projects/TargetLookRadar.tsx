"use client";

import type { TargetLook } from "@/types";

const sliderFields: Array<{ key: keyof TargetLook; label: string }> = [
  { key: "swirl", label: "Swirl" },
  { key: "glow", label: "Glow" },
  { key: "warmth", label: "Warmth" },
  { key: "contrast", label: "Contrast" },
  { key: "sharpness", label: "Sharpness" },
  { key: "flareChaos", label: "Flare chaos" },
  { key: "stopDownCleanup", label: "Stop-down cleanup" },
  { key: "caControl", label: "CA control" },
  { key: "facesOnThirdsUsable", label: "Faces on thirds usable" }
];

export function TargetLookRadar({
  value,
  onChange
}: {
  value: TargetLook;
  onChange: (next: TargetLook) => void;
}) {
  return (
    <div className="panel space-y-3 p-4">
      <h3 className="text-base font-semibold">Target Look</h3>
      {sliderFields.map((field) => (
        <label key={field.key} className="grid grid-cols-[180px_1fr_48px] items-center gap-3 text-sm text-labMuted">
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
