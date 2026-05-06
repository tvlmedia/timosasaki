"use client";

import { useState } from "react";
import { Button } from "@/components/common/Button";
import { Select } from "@/components/common/Select";
import type { StackItemType } from "@/types";

const mainTypeOptions: Array<{ value: StackItemType; label: string }> = [
  { value: "glass", label: "Glass element" },
  { value: "spacer", label: "Spacer / Air Gap Ring" },
  { value: "iris", label: "Iris / aperture stop" },
  { value: "diffusion", label: "Diffusion / effect disk" },
  { value: "mount", label: "Mount" },
  { value: "barrel", label: "Barrel / housing" },
  { value: "retaining_ring", label: "Retaining ring" },
  { value: "custom", label: "Custom" }
];

const quickAddButtons: Array<{ type: StackItemType; label: string }> = [
  { type: "glass", label: "Add Glass" },
  { type: "spacer", label: "Add Spacer / Air Gap Ring" },
  { type: "iris", label: "Add Iris" },
  { type: "diffusion", label: "Add Diffusion / Effect" },
  { type: "retaining_ring", label: "Add Retaining Ring" },
  { type: "barrel", label: "Add Barrel" },
  { type: "mount", label: "Add Mount" },
  { type: "custom", label: "Add Custom" }
];

export function AddStackItemModal({ onAdd }: { onAdd: (type: StackItemType) => void }) {
  const [selectedType, setSelectedType] = useState<StackItemType>("spacer");

  return (
    <div className="panel space-y-4 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-labMuted">Add Stack Item</h3>

      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <Select
          label="Item type"
          value={selectedType}
          onChange={(event) => setSelectedType(event.target.value as StackItemType)}
        >
          {mainTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <div className="flex items-end">
          <Button variant="primary" className="w-full md:w-auto" onClick={() => onAdd(selectedType)}>
            Add Selected Type
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {quickAddButtons.map((item) => (
          <Button key={item.type} onClick={() => onAdd(item.type)} className="w-full">
            {item.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
