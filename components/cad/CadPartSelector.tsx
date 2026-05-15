"use client";

import { Select } from "@/components/common/Select";

export type CadPartType =
  | "element_cup"
  | "spacer_ring"
  | "iris_disk"
  | "diffusion_holder"
  | "retaining_ring"
  | "fixed_pl_barrel_with_slots"
  | "sliding_optical_carrier"
  | "main_barrel"
  | "moving_carrier"
  | "cam_sleeve";

const partOptions: Array<{ value: CadPartType; label: string }> = [
  { value: "element_cup", label: "Element cup from glass item" },
  { value: "spacer_ring", label: "Spacer / Air Gap Ring from spacer item" },
  { value: "iris_disk", label: "Iris disk from iris item" },
  { value: "diffusion_holder", label: "Diffusion holder from diffusion item" },
  { value: "retaining_ring", label: "Retaining ring from retaining ring item" },
  { value: "fixed_pl_barrel_with_slots", label: "Fixed PL barrel with axial guide slots" },
  { value: "sliding_optical_carrier", label: "Sliding optical carrier with pin holes" },
  { value: "main_barrel", label: "Main barrel (legacy/simple)" }
];

export function CadPartSelector({
  value,
  onChange,
  elementCupLabel
}: {
  value: CadPartType;
  onChange: (value: CadPartType) => void;
  elementCupLabel?: string;
}) {
  const resolvedOptions = partOptions.map((option) =>
    option.value === "element_cup" && elementCupLabel
      ? { ...option, label: elementCupLabel }
      : option
  );

  return (
    <Select label="Part Type" value={value} onChange={(event) => onChange(event.target.value as CadPartType)}>
      {resolvedOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}
