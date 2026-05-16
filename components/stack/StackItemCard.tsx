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

function formatMm(value: number | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const text = value.toFixed(2).replace(/\.?0+$/, "");
  return `${text}mm`;
}

function startCase(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getGlassDescriptor(item: Extract<StackItem, { type: "glass" }>): string {
  const size =
    item.diameterMm > 0 && item.thicknessMm > 0
      ? `Ø${formatMm(item.diameterMm)} × ${formatMm(item.thicknessMm)}`
      : "";

  if (item.physicalComponentMode === "optical_group") {
    const groupType = item.groupType ? startCase(item.groupType) : "Unknown group";
    const count = item.opticalSubElements?.length ?? 0;
    return [groupType, `${count} optical ${count === 1 ? "element" : "elements"}`, size ? `physical block ${size}` : ""]
      .filter(Boolean)
      .join(" · ");
  }

  const elementType =
    item.elementOverallType && item.elementOverallType !== "unknown"
      ? startCase(item.elementOverallType)
      : "Unknown";
  return [elementType, "single glass element", size].filter(Boolean).join(" · ");
}

function getQuickSpecs(item: StackItem): string {
  switch (item.type) {
    case "glass":
      if (
        item.hasSteppedProfile &&
        typeof item.largeDiameterMm === "number" &&
        item.largeDiameterMm > 0 &&
        typeof item.smallDiameterMm === "number" &&
        item.smallDiameterMm > 0 &&
        typeof item.largeSectionThicknessMm === "number" &&
        item.largeSectionThicknessMm > 0 &&
        typeof item.smallSectionThicknessMm === "number" &&
        item.smallSectionThicknessMm > 0
      ) {
        const directionText =
          item.stepDirection === "large_side_front"
            ? "large side front"
            : item.stepDirection === "large_side_rear"
              ? "large side rear"
              : "direction unknown";
        return [
          `Step LØ${formatMm(item.largeDiameterMm)} x ${formatMm(item.largeSectionThicknessMm)}`,
          `SØ${formatMm(item.smallDiameterMm)} x ${formatMm(item.smallSectionThicknessMm)}`,
          directionText
        ]
          .filter(Boolean)
          .join("  ·  ");
      }
      return [
        `D ${formatMm(item.diameterMm)}`,
        `T ${formatMm(item.thicknessMm)}`,
        item.advancedProfileEnabled ? `Seg ${(item.profileSegments ?? []).length}` : undefined
      ]
        .filter(Boolean)
        .join("  ·  ");
    case "spacer":
      {
        const desiredOpticalAirGapMm =
          typeof item.desiredOpticalAirGapMm === "number" && Number.isFinite(item.desiredOpticalAirGapMm)
            ? item.desiredOpticalAirGapMm
            : item.thicknessMm;
        const printedSpacerThicknessMm =
          typeof item.physicalSpacerThicknessMm === "number" && Number.isFinite(item.physicalSpacerThicknessMm)
            ? item.physicalSpacerThicknessMm
            : item.thicknessMm;
        return [
          `ID ${formatMm(item.innerDiameterMm)}`,
          `OD ${formatMm(item.outerDiameterMm)}`,
          `Air ${formatMm(desiredOpticalAirGapMm)}`,
          `Print ${formatMm(printedSpacerThicknessMm)}`
        ]
          .filter(Boolean)
          .join("  ·  ");
      }
    case "iris":
      return [
        `Disk ${formatMm(item.diskDiameterMm)}`,
        `Aperture ${formatMm(item.apertureDiameterMm)}`,
        `T ${formatMm(item.thicknessMm)}`
      ]
        .filter(Boolean)
        .join("  ·  ");
    case "diffusion":
      return [
        `Disk ${formatMm(item.diskDiameterMm)}`,
        `Clear ${formatMm(item.clearCenterDiameterMm)}`,
        `T ${formatMm(item.thicknessMm)}`
      ]
        .filter(Boolean)
        .join("  ·  ");
    case "mount":
      return [`${item.mountType}`, `Clear ${formatMm(item.innerClearanceMm)}`, `FFD ${formatMm(item.flangeDistanceMm)}`]
        .filter(Boolean)
        .join("  ·  ");
    case "barrel":
      return [`ID ${formatMm(item.innerDiameterMm)}`, `OD ${formatMm(item.outerDiameterMm)}`, `L ${formatMm(item.lengthMm)}`]
        .filter(Boolean)
        .join("  ·  ");
    case "retaining_ring":
      return [`ID ${formatMm(item.innerDiameterMm)}`, `OD ${formatMm(item.outerDiameterMm)}`, `T ${formatMm(item.thicknessMm)}`]
        .filter(Boolean)
        .join("  ·  ");
    case "custom":
      return [`D ${formatMm(item.diameterMm)}`, `L ${formatMm(item.lengthMm)}`].filter(Boolean).join("  ·  ");
    default:
      return "";
  }
}

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
  const quickSpecs = getQuickSpecs(item);
  const glassDescriptor = item.type === "glass" ? getGlassDescriptor(item) : "";

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
      {glassDescriptor && <p className="mb-2 text-xs text-labMuted">{glassDescriptor}</p>}
      {quickSpecs && <p className="mono mb-2 text-[11px] text-labMuted">{quickSpecs}</p>}
      <div className="grid grid-cols-4 gap-1">
        <Button variant="ghost" onClick={onMoveUp} className="px-2 py-1 text-[11px]">
          Up
        </Button>
        <Button variant="ghost" onClick={onMoveDown} className="px-2 py-1 text-[11px]">
          Down
        </Button>
        <Button variant="ghost" onClick={onDuplicate} className="px-2 py-1 text-[11px]">
          Dup
        </Button>
        <Button variant="ghost" onClick={onToggleLock} className="px-2 py-1 text-[11px]">
          {item.locked ? "Unlock" : "Lock"}
        </Button>
        <Button
          variant="ghost"
          onClick={onDelete}
          className="col-span-4 border-labDanger/40 px-2 py-1 text-[11px] text-labDanger hover:border-labDanger hover:text-[#ff7c7c]"
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
