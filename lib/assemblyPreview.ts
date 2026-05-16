import { calculateAirspaceInsertLayouts } from "@/lib/airspaceInserts";
import { getLargestGlassDiameter, getTotalStackLength } from "@/lib/calculations";
import { calculateFocusTravel, normalizeFocusTravelSetup } from "@/lib/focusTravel";
import type { LensProject, StackItem } from "@/types";

type PreviewStatus = "ok" | "warning" | "error";

export type AssemblyPreviewPart = {
  id: string;
  label: string;
  type:
    | "lens_cup"
    | "spacer"
    | "insert_iris"
    | "insert_filter"
    | "insert_diffusion"
    | "insert_custom"
    | "iris_disk"
    | "diffusion_disk"
    | "retaining_ring"
    | "custom";
  sourceStackItemId?: string;
  startZMm: number;
  endZMm: number;
  lengthMm: number;
  outerDiameterMm: number;
  innerDiameterMm?: number;
  apertureDiameterMm?: number;
  notes?: string;
};

export type AssemblyPreviewStatusLine = {
  status: PreviewStatus;
  message: string;
};

export type AssemblyPreviewDerived = {
  largestGlassDiameterMm: number;
  targetStackOuterDiameterMm: number;
  opticalStackLengthMm: number;
  mechanicalStackLengthMm: number;
  carrierInnerDiameterMm: number;
  carrierOuterDiameterMm: number;
  carrierLengthMm: number;
  fixedBarrelInnerDiameterMm: number;
  fixedBarrelOuterDiameterMm: number;
  fixedBarrelLengthMm: number;
  slotLengthMm: number;
  recommendedFocusTravelMm?: number;
};

export type AssemblyPreviewResult = {
  sequence: AssemblyPreviewPart[];
  statuses: AssemblyPreviewStatusLine[];
  derived: AssemblyPreviewDerived;
};

const DEFAULT_MIN_CUP_WALL_THICKNESS_MM = 2.0;
const DEFAULT_SHARED_STACK_ROUNDING_INCREMENT_MM = 0.5;
const DEFAULT_CUP_TO_CARRIER_CLEARANCE_MM = 0.6;
const DEFAULT_CARRIER_WALL_THICKNESS_MM = 2.0;
const DEFAULT_CARRIER_TO_BARREL_CLEARANCE_MM = 0.8;
const DEFAULT_FIXED_BARREL_WALL_THICKNESS_MM = 2.0;
const DEFAULT_CARRIER_LENGTH_MARGIN_MM = 3.0;
const DEFAULT_SLOT_LENGTH_WITHOUT_FOCUS_TRAVEL_MM = 32.0;

function toPositive(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

function roundUpToIncrement(value: number, increment: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(increment) || increment <= 0) return value;
  return Math.ceil(value / increment) * increment;
}

function getSpacerDesiredOpticalAirGapMm(spacer: Extract<StackItem, { type: "spacer" }>): number {
  const desired = toPositive(spacer.desiredOpticalAirGapMm);
  if (desired > 0) return desired;
  return toPositive(spacer.thicknessMm);
}

function getSpacerPrintedThicknessMm(spacer: Extract<StackItem, { type: "spacer" }>): number {
  const printed = toPositive(spacer.physicalSpacerThicknessMm);
  if (printed > 0) return printed;
  return toPositive(spacer.thicknessMm);
}

function getGlassProfileLengthMm(glass: Extract<StackItem, { type: "glass" }>): number {
  if (glass.advancedProfile?.enabled) {
    const sectionSum = (glass.advancedProfile.sections ?? []).reduce(
      (sum, section) => sum + toPositive(section.lengthMm),
      0
    );
    if (sectionSum > 0) return sectionSum;
    if (toPositive(glass.advancedProfile.totalLengthMm) > 0) return glass.advancedProfile.totalLengthMm;
  }
  if (glass.advancedProfileEnabled) {
    const legacyDepth = (glass.profileSegments ?? []).reduce(
      (sum, segment) => sum + toPositive(segment.depthMm),
      0
    );
    if (legacyDepth > 0) return legacyDepth;
  }
  return toPositive(glass.thicknessMm);
}

function estimateLensCupDepthMm(glass: Extract<StackItem, { type: "glass" }>, retainingLipDefaultMm: number): number {
  const profileLengthMm = getGlassProfileLengthMm(glass);
  const rearLipMm = Math.max(retainingLipDefaultMm, 1.2);
  return Number((Math.max(0.5, profileLengthMm + rearLipMm + 0.5)).toFixed(3));
}

function getApertureCandidate(item?: StackItem): number {
  if (!item) return 0;
  if (item.type === "glass") return toPositive(item.clearApertureMm ?? item.diameterMm - 2);
  if (item.type === "iris") return toPositive(item.apertureDiameterMm);
  if (item.type === "diffusion") return toPositive(item.clearCenterDiameterMm);
  return 0;
}

function getNearbyAperture(items: StackItem[], fromIndex: number): number {
  const scan = (direction: -1 | 1): number => {
    let index = fromIndex + direction;
    while (index >= 0 && index < items.length) {
      const candidate = getApertureCandidate(items[index]);
      if (candidate > 0) return candidate;
      index += direction;
    }
    return 0;
  };
  return Math.max(scan(-1), scan(1));
}

function deriveSizing(project: LensProject): AssemblyPreviewDerived {
  const largestGlassDiameterMm = getLargestGlassDiameter(project.stackItems);
  const targetStackOuterDiameterMm = Number(
    (
      toPositive(project.cadDefaults.targetStackOuterDiameterMm) > 0
        ? (project.cadDefaults.targetStackOuterDiameterMm as number)
        : roundUpToIncrement(
            Math.max(4, largestGlassDiameterMm + DEFAULT_MIN_CUP_WALL_THICKNESS_MM * 2),
            DEFAULT_SHARED_STACK_ROUNDING_INCREMENT_MM
          )
    ).toFixed(3)
  );
  const opticalStackLengthMm = Number(getTotalStackLength(project.stackItems).toFixed(3));

  const cupToCarrierClearanceMm = Number(
    Math.max(0, project.cadDefaults.cupToCarrierClearanceMm ?? DEFAULT_CUP_TO_CARRIER_CLEARANCE_MM).toFixed(3)
  );
  const carrierInnerDiameterMm = Number(
    (
      toPositive(project.cadDefaults.carrierInnerDiameterMm) > 0
        ? (project.cadDefaults.carrierInnerDiameterMm as number)
        : targetStackOuterDiameterMm + cupToCarrierClearanceMm
    ).toFixed(3)
  );
  const carrierWallThicknessMm = Number(
    (
      toPositive(project.cadDefaults.carrierWallThicknessMm) > 0
        ? (project.cadDefaults.carrierWallThicknessMm as number)
        : DEFAULT_CARRIER_WALL_THICKNESS_MM
    ).toFixed(3)
  );
  const carrierOuterDiameterMm = Number((carrierInnerDiameterMm + carrierWallThicknessMm * 2).toFixed(3));
  const carrierLengthMm = Number(Math.max(8, opticalStackLengthMm + DEFAULT_CARRIER_LENGTH_MARGIN_MM).toFixed(3));

  const carrierToBarrelClearanceMm = Number(
    Math.max(0, project.cadDefaults.carrierToBarrelClearanceMm ?? DEFAULT_CARRIER_TO_BARREL_CLEARANCE_MM).toFixed(3)
  );
  const fixedBarrelInnerDiameterMm = Number(
    (
      toPositive(project.cadDefaults.fixedBarrelInnerDiameterMm) > 0
        ? (project.cadDefaults.fixedBarrelInnerDiameterMm as number)
        : carrierOuterDiameterMm + carrierToBarrelClearanceMm
    ).toFixed(3)
  );
  const fixedBarrelWallThicknessMm = Number(
    (
      toPositive(project.cadDefaults.fixedBarrelWallThicknessMm) > 0
        ? (project.cadDefaults.fixedBarrelWallThicknessMm as number)
        : DEFAULT_FIXED_BARREL_WALL_THICKNESS_MM
    ).toFixed(3)
  );
  const fixedBarrelOuterDiameterMm = Number((fixedBarrelInnerDiameterMm + fixedBarrelWallThicknessMm * 2).toFixed(3));

  const focusSetup = normalizeFocusTravelSetup(project.focusTravel);
  const focusCalculated = calculateFocusTravel(focusSetup);
  const recommendedFocusTravelMm = toPositive(
    focusSetup.recommendedPrototypeTravelMm ?? focusCalculated.recommendedPrototypeTravelMm
  );
  const recommendedSlotLengthMm = toPositive(
    focusSetup.recommendedSlotLengthMm ?? focusCalculated.recommendedSlotLengthMm
  );
  const slotLengthMm = Number(
    (
      recommendedSlotLengthMm > 0
        ? recommendedSlotLengthMm
        : recommendedFocusTravelMm > 0
          ? recommendedFocusTravelMm + 2.0
          : DEFAULT_SLOT_LENGTH_WITHOUT_FOCUS_TRAVEL_MM
    ).toFixed(3)
  );
  const slotStartMm = Math.max(0, project.cadDefaults.plSlotStartFromMainBarrelMm ?? 8.0);
  const fixedBarrelLengthMm = Number((slotStartMm + slotLengthMm + 6.0).toFixed(3));

  return {
    largestGlassDiameterMm,
    targetStackOuterDiameterMm,
    opticalStackLengthMm,
    mechanicalStackLengthMm: 0,
    carrierInnerDiameterMm,
    carrierOuterDiameterMm,
    carrierLengthMm,
    fixedBarrelInnerDiameterMm,
    fixedBarrelOuterDiameterMm,
    fixedBarrelLengthMm,
    slotLengthMm,
    recommendedFocusTravelMm: recommendedFocusTravelMm > 0 ? recommendedFocusTravelMm : undefined
  };
}

export function getAssemblyPreviewData(project: LensProject): AssemblyPreviewResult {
  const derived = deriveSizing(project);
  const ordered = [...project.stackItems].sort((a, b) => a.positionIndex - b.positionIndex);
  const statuses: AssemblyPreviewStatusLine[] = [];
  const sequence: AssemblyPreviewPart[] = [];

  let zCursor = 0;
  const appendPart = (part: Omit<AssemblyPreviewPart, "startZMm" | "endZMm">) => {
    const lengthMm = Number(Math.max(0, part.lengthMm).toFixed(3));
    const startZMm = Number(zCursor.toFixed(3));
    const endZMm = Number((zCursor + lengthMm).toFixed(3));
    sequence.push({
      ...part,
      lengthMm,
      startZMm,
      endZMm
    });
    zCursor = endZMm;
  };

  ordered.forEach((item, index) => {
    if (item.type === "glass") {
      const cupDepthMm = estimateLensCupDepthMm(item, project.cadDefaults.retainingLipMm);
      const sourceDiameter = toPositive(item.diameterMm);
      appendPart({
        id: `${item.id}::cup`,
        label: `${item.name} cup`,
        type: "lens_cup",
        sourceStackItemId: item.id,
        lengthMm: cupDepthMm,
        outerDiameterMm: derived.targetStackOuterDiameterMm,
        innerDiameterMm: sourceDiameter > 0 ? sourceDiameter + Math.max(0, project.cadDefaults.printToleranceMm) : undefined,
        notes: "Generated from glass item"
      });
      return;
    }

    if (item.type === "spacer") {
      const desiredMm = getSpacerDesiredOpticalAirGapMm(item);
      const nearbyApertureMm = getNearbyAperture(ordered, index);
      const layouts = calculateAirspaceInsertLayouts(desiredMm, item.insertedItems, {
        targetStackOuterDiameterMm: derived.targetStackOuterDiameterMm,
        nearbyClearApertureMm: nearbyApertureMm
      });
      const insertLayouts = layouts.length > 1 ? layouts.slice(0, 1) : layouts;
      if (layouts.length > 1) {
        statuses.push({
          status: "warning",
          message: `${item.name}: multiple inserts in one airspace are not fully previewed yet (showing first insert).`
        });
      }

      if (insertLayouts.length === 0) {
        appendPart({
          id: item.id,
          label: `${item.name} spacer`,
          type: "spacer",
          sourceStackItemId: item.id,
          lengthMm: getSpacerPrintedThicknessMm(item) || desiredMm,
          outerDiameterMm: derived.targetStackOuterDiameterMm,
          innerDiameterMm: toPositive(item.innerDiameterMm) || undefined,
          notes: "AirSpace without inserts"
        });
        return;
      }

      insertLayouts.forEach((layout, insertIndex) => {
        layout.warnings.forEach((warning) => {
          statuses.push({
            status:
              warning.includes("too thick") || warning.includes("does not fit") ? "error" : "warning",
            message: `${layout.item.label}: ${warning}`
          });
        });

        if (layout.spacerBeforeMm > 0) {
          appendPart({
            id: `${item.id}::insert-${insertIndex + 1}::before`,
            label: `${item.name} spacer before`,
            type: "spacer",
            sourceStackItemId: item.id,
            lengthMm: layout.spacerBeforeMm,
            outerDiameterMm: derived.targetStackOuterDiameterMm,
            innerDiameterMm: toPositive(item.innerDiameterMm) || undefined,
            notes: `Before ${layout.item.type} insert`
          });
        }

        const insertType: AssemblyPreviewPart["type"] =
          layout.item.type === "iris"
            ? "insert_iris"
            : layout.item.type === "filter"
              ? "insert_filter"
              : layout.item.type === "diffusion"
                ? "insert_diffusion"
                : "insert_custom";
        appendPart({
          id: `${item.id}::insert-${insertIndex + 1}::disk`,
          label: layout.item.label,
          type: insertType,
          sourceStackItemId: item.id,
          lengthMm: toPositive(layout.item.thicknessMm),
          outerDiameterMm: toPositive(layout.item.diskDiameterMm) || derived.targetStackOuterDiameterMm,
          innerDiameterMm:
            layout.item.type === "diffusion" ? toPositive(layout.item.apertureDiameterMm) || undefined : undefined,
          apertureDiameterMm:
            layout.item.type === "iris" || layout.item.type === "filter" || layout.item.type === "custom"
              ? toPositive(layout.item.apertureDiameterMm) || undefined
              : undefined,
          notes: `Inside ${item.name}`
        });

        if (layout.spacerAfterMm > 0) {
          appendPart({
            id: `${item.id}::insert-${insertIndex + 1}::after`,
            label: `${item.name} spacer after`,
            type: "spacer",
            sourceStackItemId: item.id,
            lengthMm: layout.spacerAfterMm,
            outerDiameterMm: derived.targetStackOuterDiameterMm,
            innerDiameterMm: toPositive(item.innerDiameterMm) || undefined,
            notes: `After ${layout.item.type} insert`
          });
        }
      });
      return;
    }

    if (item.type === "iris") {
      appendPart({
        id: item.id,
        label: item.name,
        type: "iris_disk",
        sourceStackItemId: item.id,
        lengthMm: toPositive(item.thicknessMm),
        outerDiameterMm: toPositive(item.diskDiameterMm) || derived.targetStackOuterDiameterMm,
        apertureDiameterMm: toPositive(item.apertureDiameterMm) || undefined,
        notes: "Standalone iris"
      });
      return;
    }

    if (item.type === "diffusion") {
      appendPart({
        id: item.id,
        label: item.name,
        type: "diffusion_disk",
        sourceStackItemId: item.id,
        lengthMm: toPositive(item.thicknessMm),
        outerDiameterMm: toPositive(item.diskDiameterMm) || derived.targetStackOuterDiameterMm,
        innerDiameterMm: toPositive(item.clearCenterDiameterMm) || undefined,
        notes: "Standalone diffusion"
      });
      return;
    }

    if (item.type === "retaining_ring") {
      appendPart({
        id: item.id,
        label: item.name,
        type: "retaining_ring",
        sourceStackItemId: item.id,
        lengthMm: toPositive(item.thicknessMm),
        outerDiameterMm: toPositive(item.outerDiameterMm) || derived.targetStackOuterDiameterMm,
        innerDiameterMm: toPositive(item.innerDiameterMm) || undefined,
        notes: "Standalone retaining ring"
      });
      return;
    }

    if (item.type === "custom") {
      const lengthMm = toPositive(item.lengthMm);
      if (lengthMm > 0) {
        appendPart({
          id: item.id,
          label: item.name,
          type: "custom",
          sourceStackItemId: item.id,
          lengthMm,
          outerDiameterMm: toPositive(item.diameterMm) || derived.targetStackOuterDiameterMm,
          notes: "Standalone custom item"
        });
      }
    }
  });

  const dedupStatus = (status: PreviewStatus, message: string) => {
    if (statuses.some((line) => line.status === status && line.message === message)) return;
    statuses.push({ status, message });
  };

  const cups = sequence.filter((part) => part.type === "lens_cup");
  const spacers = sequence.filter((part) => part.type === "spacer");
  if (cups.some((part) => Math.abs(part.outerDiameterMm - derived.targetStackOuterDiameterMm) > 0.01)) {
    dedupStatus("warning", "One or more lens cup ODs do not match target stack OD.");
  } else if (cups.length > 0) {
    dedupStatus("ok", "Lens cup OD matches target stack OD.");
  }
  if (spacers.some((part) => Math.abs(part.outerDiameterMm - derived.targetStackOuterDiameterMm) > 0.01)) {
    dedupStatus("warning", "One or more spacer ODs do not match target stack OD.");
  } else if (spacers.length > 0) {
    dedupStatus("ok", "Spacer OD matches target stack OD.");
  }

  if (derived.carrierInnerDiameterMm <= derived.targetStackOuterDiameterMm) {
    dedupStatus("error", "Carrier inner diameter is not larger than stack OD.");
  } else {
    dedupStatus("ok", "Carrier inner diameter clears stack OD.");
  }

  if (derived.fixedBarrelInnerDiameterMm <= derived.carrierOuterDiameterMm) {
    dedupStatus("error", "Fixed barrel inner diameter is not larger than carrier outer diameter.");
  } else {
    dedupStatus("ok", "Fixed barrel inner diameter clears carrier outer diameter.");
  }

  const lastSequencePart = sequence.length ? sequence[sequence.length - 1] : undefined;
  const mechanicalStackLengthMm = Number((lastSequencePart?.endZMm ?? 0).toFixed(3));
  if (derived.carrierLengthMm < mechanicalStackLengthMm) {
    dedupStatus("warning", "Carrier length is shorter than assembled mechanical stack length.");
  } else {
    dedupStatus("ok", "Carrier length covers the assembled mechanical stack.");
  }

  if (
    toPositive(derived.recommendedFocusTravelMm) > 0 &&
    toPositive(derived.slotLengthMm) > 0 &&
    derived.slotLengthMm < (derived.recommendedFocusTravelMm as number)
  ) {
    dedupStatus("warning", "Fixed barrel slot length is shorter than recommended focus travel.");
  }

  const glassItems = ordered.filter(
    (item): item is Extract<StackItem, { type: "glass" }> => item.type === "glass"
  );
  glassItems.forEach((glass) => {
    const clearApertureMm = toPositive(glass.clearApertureMm);
    const lipEnabled = glass.retainingLipEnabled ?? true;
    const lipInnerMm = toPositive(glass.retainingLipInnerDiameterMm);
    if (lipEnabled && clearApertureMm > 0 && lipInnerMm > 0 && lipInnerMm <= clearApertureMm) {
      dedupStatus("warning", `${glass.name}: retaining lip inner diameter may vignette.`);
    }

    if (glass.advancedProfile?.enabled) {
      const sections = (glass.advancedProfile.sections ?? [])
        .slice()
        .sort((a, b) => a.index - b.index)
        .filter((section) => toPositive(section.diameterMm) > 0 && toPositive(section.lengthMm) > 0);
      if (sections.length > 1 && toPositive(glass.advancedProfile.maxDiameterMm) > 0) {
        const insertionSide = glass.cupInsertionSide === "rear" ? "rear" : "front";
        const traversal = insertionSide === "rear" ? sections.slice().reverse() : sections;
        let maxIndex = 0;
        let minDelta = Number.POSITIVE_INFINITY;
        traversal.forEach((section, index) => {
          const delta = Math.abs(section.diameterMm - (glass.advancedProfile?.maxDiameterMm as number));
          if (delta < minDelta) {
            minDelta = delta;
            maxIndex = index;
          }
        });
        const hasPreMaxSmaller = traversal.some(
          (section, index) => index < maxIndex && section.diameterMm < (glass.advancedProfile?.maxDiameterMm as number) - 0.001
        );
        if (hasPreMaxSmaller) {
          dedupStatus("warning", `${glass.name}: cup insertion side may require insertion-safe bore enlargement.`);
        }
      }
    }
  });

  return {
    sequence,
    statuses,
    derived: {
      ...derived,
      mechanicalStackLengthMm
    }
  };
}
