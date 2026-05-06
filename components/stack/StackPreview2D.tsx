"use client";

import { getItemAxialLength } from "@/lib/calculations";
import { getItemOpticalType, getItemOpticalTypeLabel } from "@/lib/stackMeta";
import type { StackItem } from "@/types";

const styleByOpticalType = {
  GLASS: { stroke: "#4aa3ff", fill: "#0f0f0f", dash: undefined as string | undefined },
  AIR_GAP: { stroke: "#5f6773", fill: "#090909", dash: "4 3" },
  IRIS: { stroke: "#f5a437", fill: "#0f0f0f", dash: undefined as string | undefined },
  DIFFUSION: { stroke: "#bf6cff", fill: "#0f0f0f", dash: undefined as string | undefined },
  FILTER: { stroke: "#ffb347", fill: "#0f0f0f", dash: undefined as string | undefined },
  EFFECT: { stroke: "#bf6cff", fill: "#0f0f0f", dash: undefined as string | undefined },
  SPACER: { stroke: "#7a7a7a", fill: "#0f0f0f", dash: undefined as string | undefined },
  RETAINING_RING: { stroke: "#4e4e4e", fill: "#0f0f0f", dash: undefined as string | undefined },
  BARREL: { stroke: "#585858", fill: "none", dash: undefined as string | undefined },
  MOUNT: { stroke: "#2dc57b", fill: "#0f0f0f", dash: undefined as string | undefined },
  CUSTOM: { stroke: "#c8c8c8", fill: "#0f0f0f", dash: undefined as string | undefined }
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
          const opticalType = getItemOpticalType(item);
          const style = styleByOpticalType[opticalType];

          return (
            <g key={item.id} onClick={() => onSelect(item.id)} className="cursor-pointer">
              <rect
                x={x}
                y={48}
                width={width}
                height={92}
                fill={selected ? "#102840" : style.fill}
                stroke={style.stroke}
                strokeWidth={selected ? 2.2 : 1.2}
                strokeDasharray={style.dash}
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
