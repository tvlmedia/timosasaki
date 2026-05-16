"use client";

import { getItemAxialLength } from "@/lib/calculations";
import { getItemOpticalType, getItemOpticalTypeLabel } from "@/lib/stackMeta";
import type { MechanicalPart, StackItem } from "@/types";

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

const styleByMechanicalType: Record<
  MechanicalPart["type"],
  { stroke: string; dash?: string; label: string }
> = {
  barrel: { stroke: "#486e96", label: "Barrel" },
  fixed_pl_barrel: { stroke: "#4a86c7", label: "Fixed PL barrel" },
  sliding_optical_carrier: { stroke: "#8bb4dd", label: "Sliding carrier" },
  main_barrel: { stroke: "#5f85ab", label: "Main barrel" },
  moving_carrier: { stroke: "#7b9fc2", label: "Moving carrier" },
  cam_sleeve: { stroke: "#6f7691", dash: "4 3", label: "Cam sleeve (TODO)" },
  mount_reference: { stroke: "#2dc57b", dash: "3 3", label: "Mount ref" },
  custom_mechanical: { stroke: "#8b8f9e", label: "Mechanical" }
};

function toPositive(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

function startCase(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getOuterDiameterMm(item: StackItem): number {
  switch (item.type) {
    case "glass":
      return toPositive(item.diameterMm);
    case "spacer":
      return toPositive(item.outerDiameterMm);
    case "iris":
      return toPositive(item.diskDiameterMm);
    case "diffusion":
      return toPositive(item.diskDiameterMm);
    case "mount":
      return Math.max(toPositive(item.innerClearanceMm) + 6, 24);
    case "barrel":
      return toPositive(item.outerDiameterMm);
    case "retaining_ring":
      return toPositive(item.outerDiameterMm);
    case "custom":
      return toPositive(item.diameterMm);
    default:
      return 0;
  }
}

function getInnerOpeningMm(item: StackItem): number {
  switch (item.type) {
    case "glass":
      return toPositive(item.clearApertureMm ?? item.diameterMm - 2);
    case "spacer":
      return toPositive(item.innerDiameterMm);
    case "iris":
      return toPositive(item.apertureDiameterMm);
    case "diffusion":
      return toPositive(item.clearCenterDiameterMm);
    case "mount":
      return toPositive(item.innerClearanceMm);
    case "barrel":
      return toPositive(item.innerDiameterMm);
    case "retaining_ring":
      return toPositive(item.innerDiameterMm);
    default:
      return 0;
  }
}

export function StackPreview2D({
  items,
  mechanicalParts = [],
  selectedId,
  onSelect
}: {
  items: StackItem[];
  mechanicalParts?: MechanicalPart[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const ordered = [...items].sort((a, b) => a.positionIndex - b.positionIndex);
  const mechanicalOutlines = mechanicalParts.filter(
    (part) => part.surroundsStack !== false && toPositive(part.outerDiameterMm) > 0
  );
  const outerDiameters = ordered.map((item) => Math.max(8, getOuterDiameterMm(item)));
  const innerOpenings = ordered.map((item) => getInnerOpeningMm(item));
  const maxMechanicalOuter = mechanicalOutlines.reduce(
    (max, part) => Math.max(max, toPositive(part.outerDiameterMm)),
    0
  );
  const maxDiameter = Math.max(...outerDiameters, maxMechanicalOuter, 30);

  const axialMm = ordered.map((item) => Math.max(0.6, getItemAxialLength(item)));
  const gap = 4;
  const usableWidth = 860;
  const minWidth = 14;
  const totalGaps = gap * Math.max(0, ordered.length - 1);
  const sumAxial = axialMm.reduce((acc, value) => acc + value, 0) || 1;
  const scale = Math.max(0, (usableWidth - totalGaps - ordered.length * minWidth) / sumAxial);
  const widths = axialMm.map((value) => minWidth + value * scale);

  const centerY = 160;
  const maxRenderedHeight = 244;
  const diameterScale = maxRenderedHeight / maxDiameter;

  const startX = 20;
  const xPositions: number[] = [];
  let cursor = startX;
  for (let i = 0; i < ordered.length; i += 1) {
    xPositions.push(cursor);
    cursor += widths[i] + gap;
  }
  const contentEndX = ordered.length
    ? xPositions[ordered.length - 1] + widths[ordered.length - 1]
    : startX + 24;
  const contentWidth = Math.max(1, contentEndX - startX);

  return (
    <div className="panel p-4">
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.14em] text-labMuted">
        <span>Front</span>
        <span>Sensor</span>
      </div>
      <svg viewBox="0 0 900 320" className="h-80 w-full rounded-xl border border-labBorder bg-[#070707]">
        <line x1={18} y1={centerY} x2={882} y2={centerY} stroke="#17304a" strokeWidth={0.8} />

        {[...mechanicalOutlines]
          .sort((a, b) => toPositive(b.outerDiameterMm) - toPositive(a.outerDiameterMm))
          .map((part, index) => {
            const style = styleByMechanicalType[part.type];
            const outerMm = Math.max(8, toPositive(part.outerDiameterMm));
            const height = Math.max(22, outerMm * diameterScale);
            const y = centerY - height / 2;
            const pad = 6 + index * 3;
            const x = startX - pad;
            const width = Math.min(860, contentWidth + pad * 2);
            const label = part.name?.trim() || style.label;
            return (
              <g key={part.id}>
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth={1.1}
                  strokeDasharray={style.dash}
                  rx={8}
                  opacity={0.9}
                />
                <text
                  x={x + 8}
                  y={y + 12}
                  fill={style.stroke}
                  fontSize="8"
                  opacity={0.85}
                >
                  {label}
                </text>
              </g>
            );
          })}

        {ordered.map((item, index) => {
          const width = widths[index];
          const x = xPositions[index];
          const selected = item.id === selectedId;
          const opticalType = getItemOpticalType(item);
          const style = styleByOpticalType[opticalType];
          const outerHeight = Math.max(18, outerDiameters[index] * diameterScale);
          const y = centerY - outerHeight / 2;

          const innerOpeningMm = innerOpenings[index];
          const innerHeightRaw = innerOpeningMm * diameterScale;
          const innerHeight = Math.max(0, Math.min(outerHeight - 6, innerHeightRaw));
          const showInnerOpening = innerHeight > 4 && width > 8;

          const showText = width > 56;
          const shortName = item.name.length > 18 ? `${item.name.slice(0, 18)}…` : item.name;
          const spacerInsertMarker =
            item.type === "spacer" && (item.insertedItems?.length ?? 0) > 0
              ? `${startCase(item.insertedItems?.[0]?.type ?? "insert")} inside${(item.insertedItems?.length ?? 0) > 1 ? ` +${(item.insertedItems?.length ?? 0) - 1}` : ""}`
              : undefined;

          return (
            <g key={item.id} onClick={() => onSelect(item.id)} className="cursor-pointer">
              <rect
                x={x}
                y={y}
                width={width}
                height={outerHeight}
                fill={selected ? "#102840" : style.fill}
                stroke={style.stroke}
                strokeWidth={selected ? 2.2 : 1.2}
                strokeDasharray={style.dash}
                rx={8}
              />
              {showInnerOpening && (
                <rect
                  x={x + 1}
                  y={centerY - innerHeight / 2}
                  width={Math.max(1, width - 2)}
                  height={innerHeight}
                  fill="#050505"
                  stroke="#1f1f1f"
                  strokeWidth={0.5}
                  rx={2}
                />
              )}
              {showText && (
                <>
                  <text x={x + width / 2} y={centerY - 8} fill="#f5f5f5" textAnchor="middle" fontSize="9.5">
                    {shortName}
                  </text>
                  <text x={x + width / 2} y={centerY + 10} fill="#9a9a9a" textAnchor="middle" fontSize="8.5">
                    {getItemOpticalTypeLabel(item)}
                  </text>
                  {spacerInsertMarker && (
                    <text x={x + width / 2} y={centerY + 22} fill="#f5a437" textAnchor="middle" fontSize="8">
                      {spacerInsertMarker}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
