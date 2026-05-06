"use client";

import { Button } from "@/components/common/Button";
import { getItemOpticalTypeLabel } from "@/lib/stackMeta";
import type { StackItem } from "@/types";

const colorByType: Record<StackItem["type"], string> = {
  glass: "border-[#4aa3ff]",
  spacer: "border-[#777]",
  iris: "border-[#ffaa33]",
  diffusion: "border-[#bf6cff]",
  mount: "border-[#2dc57b]",
  barrel: "border-[#5d5d5d]",
  retaining_ring: "border-[#89b6c7]",
  custom: "border-[#a6a6a6]"
};

export function StackItemCard({
  item,
  selected,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
  onToggleLock
}: {
  item: StackItem;
  selected: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleLock: () => void;
}) {
  const opticalTypeLabel = getItemOpticalTypeLabel(item);

  return (
    <div
      className={`rounded-xl border bg-[#0b0b0b] p-3 ${selected ? "border-labAccent" : colorByType[item.type]}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter") onSelect();
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-labText">{item.name}</p>
        <span className="text-xs uppercase tracking-wide text-labMuted">{opticalTypeLabel}</span>
      </div>
      <div className="grid grid-cols-3 gap-1">
        <Button onClick={onMoveUp} className="px-2 py-1 text-xs">
          Move Up
        </Button>
        <Button onClick={onMoveDown} className="px-2 py-1 text-xs">
          Move Down
        </Button>
        <Button onClick={onDuplicate} className="px-2 py-1 text-xs">
          Duplicate
        </Button>
        <Button onClick={onToggleLock} className="px-2 py-1 text-xs">
          {item.locked ? "Unlock" : "Lock item"}
        </Button>
        <Button variant="danger" onClick={onDelete} className="col-span-2 px-2 py-1 text-xs">
          Delete
        </Button>
      </div>
    </div>
  );
}
