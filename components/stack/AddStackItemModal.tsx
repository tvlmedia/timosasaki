"use client";

import { Button } from "@/components/common/Button";
import type { StackItemType } from "@/types";

const itemButtons: Array<{ type: StackItemType; label: string }> = [
  { type: "glass", label: "Add Glass" },
  { type: "spacer", label: "Add Spacer" },
  { type: "iris", label: "Add Iris" },
  { type: "diffusion", label: "Add Diffusion" },
  { type: "mount", label: "Add Mount" },
  { type: "barrel", label: "Add Barrel" },
  { type: "retaining_ring", label: "Add Retaining ring" },
  { type: "custom", label: "Add Custom" }
];

export function AddStackItemModal({ onAdd }: { onAdd: (type: StackItemType) => void }) {
  return (
    <div className="panel p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-labMuted">Add Stack Item</h3>
      <div className="grid grid-cols-2 gap-2">
        {itemButtons.map((item) => (
          <Button key={item.type} onClick={() => onAdd(item.type)} className="w-full">
            {item.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
