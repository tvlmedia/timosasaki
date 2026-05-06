"use client";

import { getItemAxialLength } from "@/lib/calculations";
import { getItemOpticalTypeLabel } from "@/lib/stackMeta";
import type { StackItem } from "@/types";

const colorByType: Record<StackItem["type"], string> = {
  glass: "#4aa3ff",
  spacer: "#7a7a7a",
  iris: "#f5a437",
  diffusion: "#bf6cff",
  mount: "#2dc57b",
  barrel: "#3f3f3f",
  retaining_ring: "#7cb3bf",
  custom: "#9a9a9a"
};

export function StackPreview2D({
  items,
  selectedId,
  onSelect
}: {
  items: StackItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const ordered = [...items].sort((a, b) => a.positionIndex - b.positionIndex);
  const lengths = ordered.map((item) => Math.max(3, getItemAxialLength(item)));
  const total = lengths.reduce((acc, value) => acc + value, 0) || 1;
  const scale = 860 / total;

  let cursor = 20;

  return (
    <div className="panel p-4">
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.14em] text-labMuted">
        <span>Front</span>
        <span>Sensor</span>
      </div>
      <svg viewBox="0 0 900 190" className="h-56 w-full rounded-xl border border-labBorder bg-[#070707]">
        {ordered.map((item, index) => {
          const width = Math.max(24, lengths[index] * scale);
          const x = cursor;
          cursor += width + 4;
          const selected = item.id === selectedId;

          return (
            <g key={item.id} onClick={() => onSelect(item.id)} className="cursor-pointer">
              <rect
                x={x}
                y={48}
                width={width}
                height={92}
                fill={selected ? "#102840" : "#0f0f0f"}
                stroke={colorByType[item.type]}
                strokeWidth={selected ? 2.2 : 1.2}
                rx={8}
              />
              <text x={x + width / 2} y={95} fill="#f5f5f5" textAnchor="middle" fontSize="10">
                {item.name.slice(0, 18)}
              </text>
              <text x={x + width / 2} y={112} fill="#999999" textAnchor="middle" fontSize="9">
                {getItemOpticalTypeLabel(item)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
