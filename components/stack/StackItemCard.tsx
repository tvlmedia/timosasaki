"use client";

import { Button } from "@/components/common/Button";
import { getItemOpticalType, getItemOpticalTypeLabel } from "@/lib/stackMeta";
import type { StackItem } from "@/types";

const colorByOpticalType = {
  GLASS: "border-[#4aa3ff]",
  AIR_GAP: "border-[#5f6773] border-dashed",
  IRIS: "border-[#f5a437]",
  DIFFUSION: "border-[#bf6cff]",
  FILTER: "border-[#ffb347]",
  EFFECT: "border-[#bf6cff]",
  SPACER: "border-[#7a7a7a]",
  RETAINING_RING: "border-[#4e4e4e]",
  BARREL: "border-[#5d5d5d]",
  MOUNT: "border-[#2dc57b]",
  CUSTOM: "border-[#c8c8c8]"
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
  const opticalType = getItemOpticalType(item);
  const borderClass = colorByOpticalType[opticalType];

  return (
    <div
      className={`rounded-xl border bg-[#0b0b0b] p-3 ${selected ? "border-labAccent" : borderClass}`}
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
