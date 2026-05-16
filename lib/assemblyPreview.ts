import { calculateAirspaceInsertLayouts } from "@/lib/airspaceInserts";
import { getLargestGlassDiameter, getTotalStackLength } from "@/lib/calculations";
import { calculateFocusTravel, normalizeFocusTravelSetup } from "@/lib/focusTravel";
import type { LensProject, StackItem } from "@/types";

type PreviewStatus = "ok" | "warning" | "error";

export type AssemblyPreviewPartType =
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

export type AssemblyPreviewColorRole =
  | "cup"
  | "spacer"
  | "insert"
  | "carrier"
  | "barrel"
  | "ring"
  | "custom";

export type AssemblyPreviewPart = {
  id: string;
  label: string;
  shortLabel: string;
  type: AssemblyPreviewPartType;
  colorRole: AssemblyPreviewColorRole;
  sourceStackItemId?: string;
  parentAirSpaceId?: string;
  sourceLabel?: string;
  startZMm: number;
  endZMm: number;
  lengthMm: number;
  outerDiameterMm: number;
  innerDiameterMm?: number;
  apertureDiameterMm?: number;
  warnings: string[];
  notes?: string;
  metadata?: Record<string, string | number | boolean | undefined>;
};

export type AssemblyPreviewCheck = {
  id: string;
  label: string;
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
  recommendedSlotLengthMm?: number;
  targetMountThroatDiameterMm?: number;
};

export type AssemblyPreviewResult = {
  sequence: AssemblyPreviewPart[];
  checks: AssemblyPreviewCheck[];
  derived: AssemblyPreviewDerived;
  limitations: string[];
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

function extractElementToken(label: string): string | undefined {
  const match = label.match(/\bE\d+(?:\/E\d+)?\b/i);
  if (match?.[0]) return match[0].toUpperCase();
  return undefined;
}

function toInsertShortLabel(type: "iris" | "filter" | "diffusion" | "custom"): string {
  if (type === "iris") return "Iris";
  if (type === "filter") return "Filter";
  if (type === "diffusion") return "Diff";
  return "Insert";
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
      toPositive(project.cadDefaults.plSlotLengthManualMm) > 0
        ? (project.cadDefaults.plSlotLengthManualMm as number)
        : recommendedSlotLengthMm > 0
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
    recommendedFocusTravelMm: recommendedFocusTravelMm > 0 ? recommendedFocusTravelMm : undefined,
    recommendedSlotLengthMm: recommendedSlotLengthMm > 0 ? recommendedSlotLengthMm : undefined,
    targetMountThroatDiameterMm: toPositive(focusSetup.targetMountThroatDiameterMm) || undefined
  };
}

export function getAssemblyPreviewData(project: LensProject): AssemblyPreviewResult {
  const derived = deriveSizing(project);
  const focusSetup = normalizeFocusTravelSetup(project.focusTravel);
  const ordered = [...project.stackItems].sort((a, b) => a.positionIndex - b.positionIndex);

  const sequence: AssemblyPreviewPart[] = [];
  const checks: AssemblyPreviewCheck[] = [];
  const limitations: string[] = [
    "Assembly preview is parametric and simplified. It does not render actual OpenSCAD/STL geometry. Use OpenSCAD/Cura/FreeCAD for final geometry inspection."
  ];

  const seenCheckLines = new Set<string>();
  const addCheck = (id: string, label: string, status: PreviewStatus, message: string) => {
    const key = `${id}::${status}::${message}`;
    if (seenCheckLines.has(key)) return;
    seenCheckLines.add(key);
    checks.push({ id, label, status, message });
  };

  let zCursor = 0;
  let lensCounter = 0;
  let airspaceCounter = 0;
  const airspaceIndexById = new Map<string, number>();

  const getAirspaceIndex = (stackItemId: string): number => {
    const existing = airspaceIndexById.get(stackItemId);
    if (existing) return existing;
    airspaceCounter += 1;
    airspaceIndexById.set(stackItemId, airspaceCounter);
    return airspaceCounter;
  };

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
      lensCounter += 1;
      const cupDepthMm = estimateLensCupDepthMm(item, project.cadDefaults.retainingLipMm);
      const sourceDiameter = toPositive(item.diameterMm);
      const token = extractElementToken(item.name) ?? `E${lensCounter}`;
      appendPart({
        id: `${item.id}::cup`,
        label: `${item.name} cup`,
        shortLabel: token,
        type: "lens_cup",
        colorRole: "cup",
        sourceStackItemId: item.id,
        sourceLabel: item.name,
        lengthMm: cupDepthMm,
        outerDiameterMm: derived.targetStackOuterDiameterMm,
        innerDiameterMm: sourceDiameter > 0 ? sourceDiameter + Math.max(0, project.cadDefaults.printToleranceMm) : undefined,
        warnings: [],
        notes: "Generated lens cup"
      });
      return;
    }

    if (item.type === "spacer") {
      const airIndex = getAirspaceIndex(item.id);
      const desiredMm = getSpacerDesiredOpticalAirGapMm(item);
      const nearbyApertureMm = getNearbyAperture(ordered, index);
      const layouts = calculateAirspaceInsertLayouts(desiredMm, item.insertedItems, {
        targetStackOuterDiameterMm: derived.targetStackOuterDiameterMm,
        nearbyClearApertureMm: nearbyApertureMm
      });

      const insertLayouts = layouts.length > 1 ? layouts.slice(0, 1) : layouts;
      if (layouts.length > 1) {
        addCheck(
          "airspace_insert_multi",
          "AirSpace insert layout",
          "warning",
          `${item.name}: multiple inserts in one airspace are not fully previewed yet (showing first insert).`
        );
      }

      if (insertLayouts.length === 0) {
        appendPart({
          id: item.id,
          label: `${item.name} spacer`,
          shortLabel: `Air ${airIndex}`,
          type: "spacer",
          colorRole: "spacer",
          sourceStackItemId: item.id,
          sourceLabel: item.name,
          lengthMm: getSpacerPrintedThicknessMm(item) || desiredMm,
          outerDiameterMm: derived.targetStackOuterDiameterMm,
          innerDiameterMm: toPositive(item.innerDiameterMm) || undefined,
          warnings: [],
          notes: "AirSpace spacer"
        });
        return;
      }

      insertLayouts.forEach((layout, insertIndex) => {
        const warningPrefix = `${item.name} / ${layout.item.label}`;
        if (layout.item.thicknessMm >= layout.desiredOpticalAirGapMm) {
          addCheck(
            `airspace_insert_fit_${item.id}_${insertIndex}`,
            "AirSpace insert fit",
            "error",
            `${warningPrefix}: inserted thickness ${layout.item.thicknessMm.toFixed(3)}mm is not smaller than desired airspace ${layout.desiredOpticalAirGapMm.toFixed(3)}mm.`
          );
        }
        if (layout.spacerBeforeMm < 0 || layout.spacerAfterMm < 0) {
          addCheck(
            `airspace_insert_negative_${item.id}_${insertIndex}`,
            "AirSpace insert position",
            "error",
            `${warningPrefix}: insert position does not fit inside this airspace.`
          );
        }
        if (layout.spacerBeforeMm >= 0 && layout.spacerBeforeMm < 0.4) {
          addCheck(
            `airspace_insert_before_thin_${item.id}_${insertIndex}`,
            "AirSpace insert spacer thickness",
            "warning",
            `${warningPrefix}: spacer before insert is very thin (${layout.spacerBeforeMm.toFixed(3)}mm).`
          );
        }
        if (layout.spacerAfterMm >= 0 && layout.spacerAfterMm < 0.4) {
          addCheck(
            `airspace_insert_after_thin_${item.id}_${insertIndex}`,
            "AirSpace insert spacer thickness",
            "warning",
            `${warningPrefix}: spacer after insert is very thin (${layout.spacerAfterMm.toFixed(3)}mm).`
          );
        }

        layout.warnings.forEach((warning, warningIndex) => {
          const lower = warning.toLowerCase();
          const severity: PreviewStatus =
            lower.includes("too thick") || lower.includes("does not fit") || lower.includes("must sum")
              ? "error"
              : "warning";
          addCheck(
            `airspace_insert_layout_${item.id}_${insertIndex}_${warningIndex}`,
            "AirSpace insert layout",
            severity,
            `${warningPrefix}: ${warning}`
          );
        });

        if (layout.spacerBeforeMm > 0) {
          appendPart({
            id: `${item.id}::insert-${insertIndex + 1}::before`,
            label: `${item.name} spacer before`,
            shortLabel: `Air ${airIndex}a`,
            type: "spacer",
            colorRole: "spacer",
            sourceStackItemId: item.id,
            parentAirSpaceId: item.id,
            sourceLabel: item.name,
            lengthMm: layout.spacerBeforeMm,
            outerDiameterMm: derived.targetStackOuterDiameterMm,
            innerDiameterMm: toPositive(item.innerDiameterMm) || undefined,
            warnings: layout.spacerBeforeMm < 0.4 ? ["Very thin spacer section"] : [],
            notes: `Before ${layout.item.type} insert`
          });
        }

        const insertType: AssemblyPreviewPartType =
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
          shortLabel: toInsertShortLabel(layout.item.type),
          type: insertType,
          colorRole: "insert",
          sourceStackItemId: item.id,
          parentAirSpaceId: item.id,
          sourceLabel: item.name,
          lengthMm: toPositive(layout.item.thicknessMm),
          outerDiameterMm: toPositive(layout.item.diskDiameterMm) || derived.targetStackOuterDiameterMm,
          innerDiameterMm:
            layout.item.type === "diffusion" ? toPositive(layout.item.apertureDiameterMm) || undefined : undefined,
          apertureDiameterMm:
            layout.item.type === "iris" || layout.item.type === "filter" || layout.item.type === "custom"
              ? toPositive(layout.item.apertureDiameterMm) || undefined
              : undefined,
          warnings: [...layout.warnings],
          notes: `Inside ${item.name}`,
          metadata: {
            positionMode: layout.item.positionMode,
            spacerBeforeMm: layout.spacerBeforeMm,
            spacerAfterMm: layout.spacerAfterMm,
            desiredOpticalAirGapMm: layout.desiredOpticalAirGapMm
          }
        });

        if (layout.spacerAfterMm > 0) {
          appendPart({
            id: `${item.id}::insert-${insertIndex + 1}::after`,
            label: `${item.name} spacer after`,
            shortLabel: `Air ${airIndex}b`,
            type: "spacer",
            colorRole: "spacer",
            sourceStackItemId: item.id,
            parentAirSpaceId: item.id,
            sourceLabel: item.name,
            lengthMm: layout.spacerAfterMm,
            outerDiameterMm: derived.targetStackOuterDiameterMm,
            innerDiameterMm: toPositive(item.innerDiameterMm) || undefined,
            warnings: layout.spacerAfterMm < 0.4 ? ["Very thin spacer section"] : [],
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
        shortLabel: "Iris",
        type: "iris_disk",
        colorRole: "insert",
        sourceStackItemId: item.id,
        sourceLabel: item.name,
        lengthMm: toPositive(item.thicknessMm),
        outerDiameterMm: toPositive(item.diskDiameterMm) || derived.targetStackOuterDiameterMm,
        apertureDiameterMm: toPositive(item.apertureDiameterMm) || undefined,
        warnings: [],
        notes: "Standalone iris"
      });
      return;
    }

    if (item.type === "diffusion") {
      appendPart({
        id: item.id,
        label: item.name,
        shortLabel: "Diff",
        type: "diffusion_disk",
        colorRole: "insert",
        sourceStackItemId: item.id,
        sourceLabel: item.name,
        lengthMm: toPositive(item.thicknessMm),
        outerDiameterMm: toPositive(item.diskDiameterMm) || derived.targetStackOuterDiameterMm,
        innerDiameterMm: toPositive(item.clearCenterDiameterMm) || undefined,
        warnings: [],
        notes: "Standalone diffusion"
      });
      return;
    }

    if (item.type === "retaining_ring") {
      appendPart({
        id: item.id,
        label: item.name,
        shortLabel: "Ring",
        type: "retaining_ring",
        colorRole: "ring",
        sourceStackItemId: item.id,
        sourceLabel: item.name,
        lengthMm: toPositive(item.thicknessMm),
        outerDiameterMm: toPositive(item.outerDiameterMm) || derived.targetStackOuterDiameterMm,
        innerDiameterMm: toPositive(item.innerDiameterMm) || undefined,
        warnings: [],
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
          shortLabel: "Custom",
          type: "custom",
          colorRole: "custom",
          sourceStackItemId: item.id,
          sourceLabel: item.name,
          lengthMm,
          outerDiameterMm: toPositive(item.diameterMm) || derived.targetStackOuterDiameterMm,
          warnings: [],
          notes: "Standalone custom item"
        });
      }
    }
  });

  const lastSequencePart = sequence.length ? sequence[sequence.length - 1] : undefined;
  const mechanicalStackLengthMm = Number((lastSequencePart?.endZMm ?? 0).toFixed(3));

  const cupAndSpacerParts = sequence.filter((part) => part.type === "lens_cup" || part.type === "spacer");
  const odMismatchToleranceMm = 0.05;
  const mismatchParts = cupAndSpacerParts.filter(
    (part) => Math.abs(part.outerDiameterMm - derived.targetStackOuterDiameterMm) > odMismatchToleranceMm
  );
  if (cupAndSpacerParts.length === 0) {
    addCheck(
      "cup_spacer_od_match",
      "Lens cup / spacer OD match",
      "warning",
      "No generated cups/spacers found to verify OD matching."
    );
  } else if (mismatchParts.length === 0) {
    addCheck(
      "cup_spacer_od_match",
      "Lens cup / spacer OD match",
      "ok",
      `Cups/spacers share OD: ${derived.targetStackOuterDiameterMm.toFixed(3)}mm`
    );
  } else {
    const names = mismatchParts.slice(0, 3).map((part) => part.shortLabel).join(", ");
    addCheck(
      "cup_spacer_od_match",
      "Lens cup / spacer OD match",
      "warning",
      `OD mismatch against target ${derived.targetStackOuterDiameterMm.toFixed(3)}mm (${names}${mismatchParts.length > 3 ? ", ..." : ""}).`
    );
  }

  const stackToCarrierClearanceMm = Number(
    (derived.carrierInnerDiameterMm - derived.targetStackOuterDiameterMm).toFixed(3)
  );
  if (stackToCarrierClearanceMm <= 0) {
    addCheck(
      "stack_fits_carrier",
      "Stack fits in carrier",
      "error",
      `Carrier ID is not larger than stack OD (${stackToCarrierClearanceMm.toFixed(3)}mm clearance).`
    );
  } else {
    addCheck(
      "stack_fits_carrier",
      "Stack fits in carrier",
      "ok",
      `Stack fits carrier: ${stackToCarrierClearanceMm.toFixed(3)}mm radial clearance basis.`
    );
  }

  const carrierToBarrelClearanceMm = Number(
    (derived.fixedBarrelInnerDiameterMm - derived.carrierOuterDiameterMm).toFixed(3)
  );
  if (carrierToBarrelClearanceMm <= 0) {
    addCheck(
      "carrier_fits_barrel",
      "Carrier fits in fixed barrel",
      "error",
      `Fixed barrel ID is not larger than carrier OD (${carrierToBarrelClearanceMm.toFixed(3)}mm clearance).`
    );
  } else {
    addCheck(
      "carrier_fits_barrel",
      "Carrier fits in fixed barrel",
      "ok",
      `Carrier fits fixed barrel: ${carrierToBarrelClearanceMm.toFixed(3)}mm radial clearance basis.`
    );
  }

  if (derived.carrierLengthMm < mechanicalStackLengthMm) {
    addCheck(
      "carrier_length_vs_stack",
      "Carrier length vs stack length",
      "warning",
      `Carrier is shorter than assembled mechanical stack (${derived.carrierLengthMm.toFixed(3)}mm < ${mechanicalStackLengthMm.toFixed(3)}mm).`
    );
  } else {
    addCheck(
      "carrier_length_vs_stack",
      "Carrier length vs stack length",
      "ok",
      `Carrier length covers stack (${derived.carrierLengthMm.toFixed(3)}mm >= ${mechanicalStackLengthMm.toFixed(3)}mm).`
    );
  }

  const slotTargetMm = toPositive(derived.recommendedSlotLengthMm) || toPositive(derived.recommendedFocusTravelMm);
  if (slotTargetMm > 0) {
    if (derived.slotLengthMm < slotTargetMm) {
      addCheck(
        "slot_length_vs_focus",
        "Fixed barrel slot length vs focus travel",
        "warning",
        `Slot length ${derived.slotLengthMm.toFixed(3)}mm is shorter than recommendation ${slotTargetMm.toFixed(3)}mm.`
      );
    } else {
      addCheck(
        "slot_length_vs_focus",
        "Fixed barrel slot length vs focus travel",
        "ok",
        `Slot length ${derived.slotLengthMm.toFixed(3)}mm meets recommendation ${slotTargetMm.toFixed(3)}mm.`
      );
    }
  } else {
    addCheck(
      "slot_length_vs_focus",
      "Fixed barrel slot length vs focus travel",
      "warning",
      "Focus travel recommendation unavailable; verify slot length manually."
    );
  }

  const ringLikeParts = sequence.filter(
    (part) =>
      part.type === "spacer" ||
      part.type === "retaining_ring" ||
      part.type === "diffusion_disk" ||
      part.type === "iris_disk" ||
      part.type === "insert_iris" ||
      part.type === "insert_filter" ||
      part.type === "insert_diffusion" ||
      part.type === "insert_custom"
  );
  ringLikeParts.forEach((part, index) => {
    const apertureOrInner = toPositive(part.innerDiameterMm) || toPositive(part.apertureDiameterMm);
    if (apertureOrInner <= 0) return;

    if (part.outerDiameterMm <= apertureOrInner) {
      addCheck(
        `ring_geometry_${index}`,
        "Ring geometry",
        "error",
        `${part.label}: OD ${part.outerDiameterMm.toFixed(3)}mm must be larger than ID/aperture ${apertureOrInner.toFixed(3)}mm.`
      );
      return;
    }

    const wallMm = (part.outerDiameterMm - apertureOrInner) / 2;
    if (wallMm <= 0) {
      addCheck(
        `ring_geometry_${index}`,
        "Ring geometry",
        "error",
        `${part.label}: non-positive wall thickness.`
      );
    } else if (wallMm < 0.8) {
      addCheck(
        `ring_geometry_${index}`,
        "Ring geometry",
        "warning",
        `${part.label}: thin ring wall ${wallMm.toFixed(3)}mm.`
      );
    }
  });

  const glassItems = ordered.filter(
    (item): item is Extract<StackItem, { type: "glass" }> => item.type === "glass"
  );
  glassItems.forEach((glass, index) => {
    const clearApertureMm = toPositive(glass.clearApertureMm);
    const lipEnabled = glass.retainingLipEnabled ?? true;
    const lipInnerMm = toPositive(glass.retainingLipInnerDiameterMm);
    const boreEstimateMm = toPositive(glass.diameterMm) + Math.max(0, project.cadDefaults.printToleranceMm);

    if (lipEnabled && clearApertureMm > 0 && lipInnerMm > 0 && lipInnerMm <= clearApertureMm) {
      addCheck(
        `retaining_lip_vignette_${index}`,
        "Retaining lip / cup insertion",
        "warning",
        `${glass.name}: retaining lip inner diameter may vignette the clear aperture.`
      );
    }

    if (lipEnabled && lipInnerMm > 0 && boreEstimateMm > 0 && lipInnerMm >= boreEstimateMm - 0.01) {
      addCheck(
        `retaining_lip_geometry_${index}`,
        "Retaining lip / cup insertion",
        "warning",
        `${glass.name}: retaining lip inner diameter is near/above bore diameter, lip retention may be ineffective.`
      );
    }

    if (glass.advancedProfile?.enabled) {
      const sections = (glass.advancedProfile.sections ?? [])
        .slice()
        .sort((a, b) => a.index - b.index)
        .filter((section) => toPositive(section.diameterMm) > 0 && toPositive(section.lengthMm) > 0);

      if (!sections.length) {
        addCheck(
          `advanced_profile_sections_${index}`,
          "Retaining lip / cup insertion",
          "warning",
          `${glass.name}: advanced profile enabled but no valid sections.`
        );
      }

      const totalFromSections = sections.reduce((sum, section) => sum + toPositive(section.lengthMm), 0);
      const totalLength = toPositive(glass.advancedProfile.totalLengthMm);
      if (totalLength > 0 && totalFromSections > 0) {
        const diff = Math.abs(totalLength - totalFromSections);
        if (diff > 2.0) {
          addCheck(
            `advanced_profile_length_${index}`,
            "Retaining lip / cup insertion",
            "warning",
            `${glass.name}: advanced profile section sum differs from total by ${diff.toFixed(3)}mm.`
          );
        } else if (diff > 1.0) {
          addCheck(
            `advanced_profile_length_${index}`,
            "Retaining lip / cup insertion",
            "warning",
            `${glass.name}: advanced profile section sum differs from total by ${diff.toFixed(3)}mm.`
          );
        }
      }

      const maxSectionDiameterMm = sections.reduce(
        (max, section) => Math.max(max, toPositive(section.diameterMm)),
        0
      );
      const maxDiameterMm = toPositive(glass.advancedProfile.maxDiameterMm);
      if (maxDiameterMm > 0 && maxSectionDiameterMm > maxDiameterMm + 0.001) {
        addCheck(
          `advanced_profile_max_${index}`,
          "Retaining lip / cup insertion",
          "warning",
          `${glass.name}: advanced profile max diameter is smaller than a section diameter.`
        );
      }

      if (sections.length > 1 && maxDiameterMm > 0) {
        const insertionSide = glass.cupInsertionSide === "rear" ? "rear" : "front";
        const traversal = insertionSide === "rear" ? sections.slice().reverse() : sections;
        let maxIndex = 0;
        let minDelta = Number.POSITIVE_INFINITY;
        traversal.forEach((section, sectionIndex) => {
          const delta = Math.abs(section.diameterMm - maxDiameterMm);
          if (delta < minDelta) {
            minDelta = delta;
            maxIndex = sectionIndex;
          }
        });
        const hasPreMaxSmaller = traversal.some(
          (section, sectionIndex) => sectionIndex < maxIndex && section.diameterMm < maxDiameterMm - 0.001
        );
        if (hasPreMaxSmaller) {
          addCheck(
            `cup_insertion_${index}`,
            "Retaining lip / cup insertion",
            "warning",
            `${glass.name}: selected insertion side may require insertion-safe bore enlargement.`
          );
        }
      }
    }
  });

  if (focusSetup.targetMount === "PL" && !toPositive(derived.targetMountThroatDiameterMm)) {
    addCheck(
      "pl_throat",
      "PL throat clearance",
      "warning",
      "PL throat not measured. Measure actual mount throat before finalizing rear carrier clearance."
    );
  } else if (toPositive(derived.targetMountThroatDiameterMm) > 0) {
    const throatClearanceMm = Number(
      ((derived.targetMountThroatDiameterMm as number) - derived.carrierOuterDiameterMm).toFixed(3)
    );
    if (throatClearanceMm < 0) {
      addCheck(
        "pl_throat",
        "PL throat clearance",
        "error",
        `Carrier OD exceeds target mount throat (${throatClearanceMm.toFixed(3)}mm clearance).`
      );
    } else if (throatClearanceMm < 1.0) {
      addCheck(
        "pl_throat",
        "PL throat clearance",
        "warning",
        `Rear carrier to mount throat clearance is very tight (${throatClearanceMm.toFixed(3)}mm).`
      );
    } else if (throatClearanceMm < 2.0) {
      addCheck(
        "pl_throat",
        "PL throat clearance",
        "warning",
        `Rear carrier to mount throat clearance is small (${throatClearanceMm.toFixed(3)}mm).`
      );
    } else {
      addCheck(
        "pl_throat",
        "PL throat clearance",
        "ok",
        `Rear carrier clears PL throat by ${throatClearanceMm.toFixed(3)}mm.`
      );
    }
  }

  return {
    sequence,
    checks,
    derived: {
      ...derived,
      mechanicalStackLengthMm
    },
    limitations
  };
}
