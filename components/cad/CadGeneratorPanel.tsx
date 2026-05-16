"use client";

import { useEffect, useMemo, useState } from "react";
import { CadPartSelector, type CadPartType } from "@/components/cad/CadPartSelector";
import { AssemblyPreviewPanel } from "@/components/cad/AssemblyPreviewPanel";
import { PartSpecCard } from "@/components/cad/PartSpecCard";
import { ScadCodeViewer } from "@/components/cad/ScadCodeViewer";
import { Button } from "@/components/common/Button";
import { NumberInput } from "@/components/common/NumberInput";
import { Select } from "@/components/common/Select";
import { WarningBox } from "@/components/common/WarningBox";
import {
  calculateAirspaceInsertLayouts,
  getAirspaceInsertedItemsTotalThicknessMm
} from "@/lib/airspaceInserts";
import {
  getPartWarnings,
  getLargestGlassDiameter,
  getRecommendedBarrelInnerDiameter,
  getRecommendedBarrelOuterDiameter,
  getStackWarnings,
  getTotalStackLength
} from "@/lib/calculations";
import { generateFreecadMacro, type FreecadPayload } from "@/lib/freecad";
import { safeFileName } from "@/lib/ids";
import { generateScad, type ScadPayload } from "@/lib/scad";
import { generateFixedPlBarrelWithSlotsPushPullV4Scad } from "@/lib/scad/fixedPlBarrelWithSlots";
import { downloadTextFile } from "@/lib/storage";
import type { CadDefaults, ElementCupParams, LensProject, StackItem } from "@/types";

const DEFAULT_PL_STEP_RELATIVE_PATH = "cad/reference/PL_Lens_Tail.STEP";
const DEFAULT_PL_STL_RELATIVE_PATH = "cad/reference/PL_Lens_Tail.stl";
const DEFAULT_PL_STEP_ABSOLUTE_PATH =
  "/Users/tvlmedia/Downloads/Timo Sasaki/_repo/cad/reference/PL_Lens_Tail.STEP";
const DEFAULT_PL_STL_ABSOLUTE_PATH =
  "/Users/tvlmedia/Downloads/Timo Sasaki/_repo/cad/reference/PL_Lens_Tail.stl";

const needsSource: Record<CadPartType, StackItem["type"] | null> = {
  element_cup: "glass",
  spacer_ring: "spacer",
  iris_disk: "iris",
  diffusion_holder: "diffusion",
  retaining_ring: "retaining_ring",
  fixed_pl_barrel_with_slots: null,
  sliding_optical_carrier: "glass",
  guide_pin: null,
  main_barrel: "barrel",
  moving_carrier: "barrel",
  cam_sleeve: "barrel"
};

function pretty(value: number): string {
  return value.toFixed(2);
}

function toMmToken(value: number): string {
  return value.toFixed(1).replace(".", "_");
}

function toPositive(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

type FocusTravelLike = {
  originalFlangeDistanceMm?: number;
  targetFlangeDistanceMm?: number;
  donorFlangeToReferenceInfinityMm?: number;
  donorFlangeToReferenceCloseFocusMm?: number;
  infinityOvertravelMm?: number;
  closeFocusExtraMarginMm?: number;
  slotMechanicalClearanceMm?: number;
  targetMountThroatDiameterMm?: number;
  recommendedPrototypeTravelMm?: number;
  recommendedSlotLengthMm?: number;
  prototypeStartMm?: number;
};

type SlidingCarrierLengthSource = "manual" | "lens_cup_or_stack";

type SlidingCarrierOverrides = {
  lengthSource: SlidingCarrierLengthSource;
  manualLengthMm: number;
};

type GuidePinOverrides = {
  pinShaftDiameterMm?: number;
  pinShaftLengthMm?: number;
  pinHeadDiameterMm?: number;
  pinHeadThicknessMm?: number;
  tipChamferMm?: number;
  quantity?: number;
};

type GuidePinResolved = {
  pinShaftDiameterMm: number;
  pinShaftLengthMm: number;
  pinHeadDiameterMm: number;
  pinHeadThicknessMm: number;
  tipChamferMm: number;
  quantity: number;
};

type CarrierLengthDerivedSource = "manual" | "optical_stack_length";
type SlotLengthSource = "focus_travel" | "manual_default";
type ResolvedCupInsertionSide = "front" | "rear";
type ResolvedCupRetainingSide = "front" | "rear" | "both" | "none";

type CadSourceCandidate = {
  id: string;
  sourceItem: StackItem;
};

type PackageSmallPart = {
  label: string;
  payload: ScadPayload;
  sourceStackItemName?: string;
};

type BuiltAllPartsPackage = {
  builtAtIso: string;
  smallPartsScad: string;
  slidingCarrierScad: string;
  fixedPlBarrelScad: string;
  summaryText: string;
  generatedPartLabels: string[];
  warnings: string[];
  errors: string[];
};

type CascadeSizing = {
  sourceGlass?: Extract<StackItem, { type: "glass" }>;
  sourceGlassMaxDiameterMm: number;
  opticalStackLengthMm: number;
  cupDepthMm?: number;
  cupOuterDiameterMm: number;
  minimumCupWallThicknessMm: number;
  cupToCarrierClearanceMm: number;
  targetStackOuterDiameterMm: number;
  targetStackOuterDiameterSource: "manual" | "largest_glass_auto";
  carrierLengthMm: number;
  carrierLengthSource: CarrierLengthDerivedSource;
  carrierInnerDiameterMm: number;
  carrierInnerDiameterSource: "manual" | "auto";
  carrierWallThicknessMm: number;
  carrierWallThicknessSource: "manual" | "auto";
  carrierOuterDiameterMm: number;
  carrierToBarrelClearanceMm: number;
  fixedBarrelInnerDiameterMm: number;
  fixedBarrelInnerDiameterSource: "manual" | "auto";
  fixedBarrelWallThicknessMm: number;
  fixedBarrelWallThicknessSource: "manual" | "auto";
  fixedBarrelOuterDiameterMm: number;
  slotLengthMm: number;
  slotLengthSource: SlotLengthSource;
  slotStartFromMainBarrelMm: number;
  barrelEndMarginMm: number;
  mainBarrelLengthMm: number;
};

const CARRIER_LENGTH_MARGIN_MM = 3.0;
const DEFAULT_CARRIER_TO_BARREL_CLEARANCE_MM = 0.8;
const DEFAULT_CUP_TO_CARRIER_CLEARANCE_MM = 0.6;
const DEFAULT_CARRIER_WALL_THICKNESS_MM = 2.0;
const DEFAULT_FIXED_BARREL_WALL_THICKNESS_MM = 2.0;
const DEFAULT_BARREL_END_MARGIN_MM = 6.0;
const DEFAULT_MINIMUM_CUP_WALL_THICKNESS_MM = 2.0;
const DEFAULT_SHARED_STACK_ROUNDING_INCREMENT_MM = 0.5;
const DEFAULT_SLOT_LENGTH_WITHOUT_FOCUS_TRAVEL_MM = 32.0;
const DEFAULT_GUIDE_PIN_SHAFT_LENGTH_MM = 8.0;
const DEFAULT_GUIDE_PIN_HEAD_DIAMETER_MM = 5.5;
const DEFAULT_GUIDE_PIN_HEAD_THICKNESS_MM = 1.8;
const DEFAULT_GUIDE_PIN_TIP_CHAMFER_MM = 0.2;
const DEFAULT_GUIDE_PIN_QUANTITY = 2;

function roundUpToIncrement(value: number, increment: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(increment) || increment <= 0) return value;
  return Math.ceil(value / increment) * increment;
}

function toFiniteOrUndefined(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getFocusTravelDerived(project: LensProject): {
  recommendedPrototypeTravelMm?: number;
  recommendedSlotLengthMm?: number;
  prototypeStartMm?: number;
  targetMountThroatDiameterMm?: number;
} {
  const focus = (project as unknown as { focusTravel?: FocusTravelLike }).focusTravel;
  if (!focus) {
    return {};
  }

  const directRecommended = toFiniteOrUndefined(focus.recommendedPrototypeTravelMm);
  const directSlotLength = toFiniteOrUndefined(focus.recommendedSlotLengthMm);
  const directStart = toFiniteOrUndefined(focus.prototypeStartMm);
  if (directRecommended && directRecommended > 0) {
    return {
      recommendedPrototypeTravelMm: directRecommended,
      recommendedSlotLengthMm: directSlotLength && directSlotLength > 0 ? directSlotLength : undefined,
      prototypeStartMm: directStart,
      targetMountThroatDiameterMm: toFiniteOrUndefined(focus.targetMountThroatDiameterMm)
    };
  }

  const donorInfinity = toFiniteOrUndefined(focus.donorFlangeToReferenceInfinityMm);
  const donorClose = toFiniteOrUndefined(focus.donorFlangeToReferenceCloseFocusMm);
  const originalFlange = toFiniteOrUndefined(focus.originalFlangeDistanceMm);
  const targetFlange = toFiniteOrUndefined(focus.targetFlangeDistanceMm);
  const overtravel = Math.max(0, toFiniteOrUndefined(focus.infinityOvertravelMm) ?? 10);
  const closeMargin = Math.max(0, toFiniteOrUndefined(focus.closeFocusExtraMarginMm) ?? 5);
  const slotMechanicalClearanceMm = Math.max(0, toFiniteOrUndefined(focus.slotMechanicalClearanceMm) ?? 2);

  if (
    donorInfinity === undefined ||
    donorClose === undefined ||
    originalFlange === undefined ||
    targetFlange === undefined
  ) {
    return {
      targetMountThroatDiameterMm: toFiniteOrUndefined(focus.targetMountThroatDiameterMm)
    };
  }

  const targetOffset = targetFlange - originalFlange;
  const targetPositionInfinity = donorInfinity - targetOffset;
  const prototypeStart = targetPositionInfinity - overtravel;
  const actualFocusTravel = Math.abs(donorInfinity - donorClose);
  const recommendedTravel = actualFocusTravel + overtravel + closeMargin;

  return {
    recommendedPrototypeTravelMm: recommendedTravel > 0 ? recommendedTravel : undefined,
    recommendedSlotLengthMm:
      recommendedTravel > 0 ? Number((recommendedTravel + slotMechanicalClearanceMm).toFixed(3)) : undefined,
    prototypeStartMm: prototypeStart,
    targetMountThroatDiameterMm: toFiniteOrUndefined(focus.targetMountThroatDiameterMm)
  };
}

function deriveGuidePinSizing(defaults: CadDefaults, cascade: CascadeSizing): {
  slotWidthMm: number;
  carrierPinHoleDiameterMm: number;
  autoPinShaftDiameterMm: number;
  fixedBarrelWallThicknessMm: number;
  carrierWallThicknessMm: number;
  minimumRecommendedShaftLengthMm: number;
} {
  const basePinDiameterMm = Math.max(1.0, defaults.plPinDiameterMm ?? defaults.camPinDiameterMm ?? 2.0);
  const basePinClearanceMm = Math.max(0.1, defaults.plPinClearanceMm ?? 0.3);
  const slotWidthMm = Number((basePinDiameterMm + basePinClearanceMm).toFixed(3));
  const carrierPinHoleDiameterMm = Number((basePinDiameterMm + basePinClearanceMm).toFixed(3));
  const autoPinShaftDiameterMm = Number(
    Math.max(0.6, Math.min(slotWidthMm, carrierPinHoleDiameterMm) - 0.2).toFixed(3)
  );

  const fixedBarrelWallThicknessRawMm =
    (toPositive(cascade.fixedBarrelOuterDiameterMm) - toPositive(cascade.fixedBarrelInnerDiameterMm)) / 2;
  const fixedBarrelWallThicknessMm = Number(Math.max(0, fixedBarrelWallThicknessRawMm).toFixed(3));

  const carrierWallThicknessRawMm =
    (toPositive(cascade.carrierOuterDiameterMm) - toPositive(cascade.carrierInnerDiameterMm)) / 2;
  const carrierWallThicknessMm = Number(Math.max(0, carrierWallThicknessRawMm).toFixed(3));

  const minimumRecommendedShaftLengthMm = Number(
    (fixedBarrelWallThicknessMm + carrierWallThicknessMm + 0.6).toFixed(3)
  );

  return {
    slotWidthMm,
    carrierPinHoleDiameterMm,
    autoPinShaftDiameterMm,
    fixedBarrelWallThicknessMm,
    carrierWallThicknessMm,
    minimumRecommendedShaftLengthMm
  };
}

function resolvePlStepPath(raw?: string): string {
  const normalized = (raw ?? DEFAULT_PL_STEP_RELATIVE_PATH).trim();
  if (normalized === DEFAULT_PL_STEP_RELATIVE_PATH) {
    return DEFAULT_PL_STEP_ABSOLUTE_PATH;
  }
  return normalized;
}

function derivePlStlPathFromStepPath(stepPathRaw?: string): string {
  const stepPath = resolvePlStepPath(stepPathRaw);
  if (stepPath.toLowerCase().endsWith(".stl")) return stepPath;
  if (stepPath.toLowerCase() === DEFAULT_PL_STEP_ABSOLUTE_PATH.toLowerCase()) {
    return DEFAULT_PL_STL_ABSOLUTE_PATH;
  }
  if (stepPath.toLowerCase() === DEFAULT_PL_STEP_RELATIVE_PATH.toLowerCase()) {
    return DEFAULT_PL_STL_RELATIVE_PATH;
  }
  return stepPath.replace(/\.step$/i, ".stl");
}

function formatScadValue(value: number): string {
  if (!Number.isFinite(value)) return "0.000";
  return value.toFixed(3);
}

function indentScadCode(code: string, spaces = 2): string {
  const prefix = " ".repeat(spaces);
  return code
    .split("\n")
    .map((line) => (line.length ? `${prefix}${line}` : line))
    .join("\n");
}

function sanitizeScadModuleName(label: string): string {
  const safe = safeFileName(label).replace(/[^a-z0-9_]/g, "_");
  return safe ? safe : "part";
}

function getPackageBaseFileName(projectName: string): string {
  const safeProjectName = safeFileName(projectName) || "project";
  return `TimoSasaki_${safeProjectName}`;
}

function getPayloadFootprintMm(payload: ScadPayload): { widthMm: number; depthMm: number; xOffsetMm: number; yOffsetMm: number; zLiftMm: number } {
  if (payload.type === "element_cup") {
    const d = Math.max(2, toPositive(payload.params.outerDiameterMm) || toPositive(payload.params.glassDiameterMm));
    return { widthMm: d, depthMm: d, xOffsetMm: d / 2, yOffsetMm: d / 2, zLiftMm: 0 };
  }
  if (payload.type === "spacer_ring") {
    const d = Math.max(2, toPositive(payload.params.outerDiameterMm));
    return { widthMm: d, depthMm: d, xOffsetMm: d / 2, yOffsetMm: d / 2, zLiftMm: 0 };
  }
  if (payload.type === "iris_disk") {
    const d = Math.max(2, toPositive(payload.params.diskDiameterMm));
    return { widthMm: d, depthMm: d, xOffsetMm: d / 2, yOffsetMm: d / 2, zLiftMm: 0 };
  }
  if (payload.type === "diffusion_holder") {
    const d = Math.max(2, toPositive(payload.params.diskDiameterMm) + toPositive(payload.params.wallThicknessMm) * 2);
    return { widthMm: d, depthMm: d, xOffsetMm: d / 2, yOffsetMm: d / 2, zLiftMm: 0 };
  }
  if (payload.type === "guide_pin") {
    const shaftLengthMm = Math.max(1, toPositive(payload.params.pinShaftLengthMm));
    const headDiameterMm = Math.max(1, toPositive(payload.params.pinHeadDiameterMm));
    const quantity = Math.max(1, Math.round(payload.params.quantity));
    const depthMm = quantity * headDiameterMm + (quantity - 1) * 2.0;
    return {
      widthMm: shaftLengthMm,
      depthMm,
      xOffsetMm: 0,
      yOffsetMm: headDiameterMm / 2,
      zLiftMm: headDiameterMm / 2
    };
  }
  return { widthMm: 30, depthMm: 30, xOffsetMm: 15, yOffsetMm: 15, zLiftMm: 0 };
}

function buildSmallPartsPlateScad(parts: PackageSmallPart[]): string {
  const partSpacingMm = 8.0;
  const rowSpacingMm = 8.0;
  const plateMarginMm = 5.0;
  const maxRowWidthMm = 220.0;

  let cursorX = plateMarginMm;
  let cursorY = plateMarginMm;
  let rowDepthMm = 0;

  const placements = parts.map((entry) => {
    const footprint = getPayloadFootprintMm(entry.payload);
    const widthWithSpacing = footprint.widthMm + partSpacingMm;
    const depthWithSpacing = footprint.depthMm + rowSpacingMm;
    if (cursorX > plateMarginMm && cursorX + footprint.widthMm > maxRowWidthMm - plateMarginMm) {
      cursorX = plateMarginMm;
      cursorY += rowDepthMm;
      rowDepthMm = 0;
    }
    const placement = {
      xMm: cursorX + footprint.xOffsetMm,
      yMm: cursorY + footprint.yOffsetMm,
      zMm: footprint.zLiftMm
    };
    cursorX += widthWithSpacing;
    rowDepthMm = Math.max(rowDepthMm, depthWithSpacing);
    return placement;
  });

  const moduleBlocks = parts
    .map((entry, index) => {
      const moduleName = `part_${String(index + 1).padStart(2, "0")}_${sanitizeScadModuleName(entry.label)}`;
      const code = generateScad(entry.payload).trimEnd();
      return `// Part ${String(index + 1).padStart(2, "0")}: ${entry.label}
module ${moduleName}() {
${indentScadCode(code, 2)}
}
`;
    })
    .join("\n");

  const placementCalls = parts
    .map((entry, index) => {
      const moduleName = `part_${String(index + 1).padStart(2, "0")}_${sanitizeScadModuleName(entry.label)}`;
      const placement = placements[index];
      return `translate([${formatScadValue(placement.xMm)}, ${formatScadValue(placement.yMm)}, ${formatScadValue(placement.zMm)}]) ${moduleName}();`;
    })
    .join("\n");

  return `// Timo Sasaki Lens Lab — Build All Parts Package (small parts plate)
// Small parts grouped on one OpenSCAD print plate.
// Carrier and fixed PL barrel are exported as separate files.

part_spacing_mm = ${formatScadValue(partSpacingMm)};
row_spacing_mm = ${formatScadValue(rowSpacingMm)};
plate_margin_mm = ${formatScadValue(plateMarginMm)};

${moduleBlocks}
// Placement
${placementCalls}
`;
}

function estimateMainBarrelLengthMm(project: LensProject, source?: StackItem): number {
  const sourceBarrel = source?.type === "barrel" ? source : undefined;
  if (sourceBarrel && sourceBarrel.lengthMm > 0) {
    return sourceBarrel.lengthMm;
  }

  const stackLength = getTotalStackLength(project.stackItems);
  if (stackLength <= 0) return 48;

  const frontRearAllowance = Math.max(project.cadDefaults.partThicknessMm * 2, 8);
  const estimated = stackLength + frontRearAllowance;
  return Number(Math.max(36, Math.min(estimated, 120)).toFixed(1));
}

function normalizeAdvancedProfileForCup(
  glass?: Extract<StackItem, { type: "glass" }>
): ElementCupParams["advancedProfile"] | undefined {
  const advanced = glass?.advancedProfile;
  if (!advanced) return undefined;
  return {
    enabled: Boolean(advanced.enabled),
    totalLengthMm: Number.isFinite(advanced.totalLengthMm) ? advanced.totalLengthMm : 0,
    maxDiameterMm: Number.isFinite(advanced.maxDiameterMm) ? advanced.maxDiameterMm : 0,
    maxDiameterPositionFromFrontMm: Number.isFinite(advanced.maxDiameterPositionFromFrontMm)
      ? advanced.maxDiameterPositionFromFrontMm
      : 0,
    sections: (advanced.sections ?? []).map((section, index) => ({
      id: section.id,
      index,
      label: section.label,
      diameterMm: Number.isFinite(section.diameterMm) ? section.diameterMm : 0,
      lengthMm: Number.isFinite(section.lengthMm) ? section.lengthMm : 0
    }))
  };
}

function getAdvancedProfileTotalLengthMm(profile: ElementCupParams["advancedProfile"] | undefined): number {
  if (!profile?.enabled) return 0;
  const sectionSum = (profile.sections ?? []).reduce((sum, section) => sum + toPositive(section.lengthMm), 0);
  if (sectionSum > 0) return sectionSum;
  return toPositive(profile.totalLengthMm);
}

function resolveCupInsertionSide(
  glass: Extract<StackItem, { type: "glass" }> | undefined,
  advancedProfile: ElementCupParams["advancedProfile"] | undefined
): ResolvedCupInsertionSide {
  if (glass?.cupInsertionSide === "front" || glass?.cupInsertionSide === "rear") {
    return glass.cupInsertionSide;
  }
  if (advancedProfile?.enabled) {
    const totalLength = getAdvancedProfileTotalLengthMm(advancedProfile);
    const maxPos = toPositive(advancedProfile.maxDiameterPositionFromFrontMm);
    if (totalLength > 0) {
      const distanceFromFront = Math.max(0, Math.min(totalLength, maxPos));
      const distanceFromRear = Math.max(0, totalLength - distanceFromFront);
      return distanceFromFront <= distanceFromRear ? "front" : "rear";
    }
  }
  return "front";
}

function resolveCupRetainingSide(
  glass: Extract<StackItem, { type: "glass" }> | undefined,
  insertionSide: ResolvedCupInsertionSide
): ResolvedCupRetainingSide {
  if (
    glass?.cupRetainingSide === "front" ||
    glass?.cupRetainingSide === "rear" ||
    glass?.cupRetainingSide === "both" ||
    glass?.cupRetainingSide === "none"
  ) {
    return glass.cupRetainingSide;
  }
  return insertionSide === "front" ? "rear" : "front";
}

function getNearestGlassOnSide(
  items: StackItem[],
  fromIndex: number,
  direction: -1 | 1
): Extract<StackItem, { type: "glass" }> | undefined {
  let index = fromIndex + direction;
  while (index >= 0 && index < items.length) {
    const current = items[index];
    if (current.type === "glass") return current;
    index += direction;
  }
  return undefined;
}

function getApertureCandidate(item?: StackItem): number {
  if (!item) return 0;
  if (item.type === "glass") return toPositive(item.clearApertureMm ?? item.diameterMm - 2);
  if (item.type === "iris") return toPositive(item.apertureDiameterMm);
  if (item.type === "diffusion") return toPositive(item.clearCenterDiameterMm);
  return 0;
}

function getNearestApertureOnSide(items: StackItem[], fromIndex: number, direction: -1 | 1): number {
  let index = fromIndex + direction;
  while (index >= 0 && index < items.length) {
    const candidate = getApertureCandidate(items[index]);
    if (candidate > 0) return candidate;
    index += direction;
  }
  return 0;
}

function getNearbyAperture(items: StackItem[], index: number): number {
  const left = getNearestApertureOnSide(items, index, -1);
  const right = getNearestApertureOnSide(items, index, 1);
  return Math.max(left, right);
}

function estimateCupOffsetsForGlass(
  glass: Extract<StackItem, { type: "glass" }> | undefined,
  defaults: CadDefaults
): {
  cupFrontOffsetMm: number;
  cupRearOffsetMm: number;
  insertionSide: ResolvedCupInsertionSide;
  retainingSide: ResolvedCupRetainingSide;
  rearLipMm: number;
  extraDepthMm: number;
  available: boolean;
} {
  if (!glass) {
    return {
      cupFrontOffsetMm: 0,
      cupRearOffsetMm: 0,
      insertionSide: "front",
      retainingSide: "rear",
      rearLipMm: 0,
      extraDepthMm: 0,
      available: false
    };
  }

  const advancedProfile = normalizeAdvancedProfileForCup(glass);
  const insertionSide = resolveCupInsertionSide(glass, advancedProfile);
  const retainingSide: ResolvedCupRetainingSide = resolveCupRetainingSide(glass, insertionSide);
  const rearLipMm = getElementCupRearLipDefaultMm(glass, defaults);
  const profileLengthMm =
    getGlassProfileLengthMm(glass) ?? toPositive(glass.thicknessMm);
  const cupDepthMm = estimateLensCupDepthMm(glass, defaults) ?? profileLengthMm + rearLipMm + 0.5;
  const extraDepthMm = Math.max(0, cupDepthMm - (profileLengthMm + rearLipMm));
  const retainingOffsetMm = retainingSide === "none" ? 0 : rearLipMm + extraDepthMm;

  if (retainingSide === "front") {
    return {
      cupFrontOffsetMm: Number(retainingOffsetMm.toFixed(3)),
      cupRearOffsetMm: 0,
      insertionSide,
      retainingSide,
      rearLipMm,
      extraDepthMm: Number(extraDepthMm.toFixed(3)),
      available: true
    };
  }
  if (retainingSide === "rear") {
    return {
      cupFrontOffsetMm: 0,
      cupRearOffsetMm: Number(retainingOffsetMm.toFixed(3)),
      insertionSide,
      retainingSide,
      rearLipMm,
      extraDepthMm: Number(extraDepthMm.toFixed(3)),
      available: true
    };
  }
  if (retainingSide === "both") {
    return {
      cupFrontOffsetMm: Number(retainingOffsetMm.toFixed(3)),
      cupRearOffsetMm: Number(retainingOffsetMm.toFixed(3)),
      insertionSide,
      retainingSide,
      rearLipMm,
      extraDepthMm: Number(extraDepthMm.toFixed(3)),
      available: true
    };
  }
  return {
    cupFrontOffsetMm: 0,
    cupRearOffsetMm: 0,
    insertionSide,
    retainingSide,
    rearLipMm,
    extraDepthMm: Number(extraDepthMm.toFixed(3)),
    available: true
  };
}

function getMeasuredGlassMaxDiameterMm(glass?: Extract<StackItem, { type: "glass" }>): number {
  if (!glass) return 0;
  const candidates: number[] = [toPositive(glass.diameterMm)];

  if (glass.hasSteppedProfile) {
    candidates.push(toPositive(glass.largeDiameterMm), toPositive(glass.smallDiameterMm));
  }

  if (glass.advancedProfile?.enabled) {
    candidates.push(toPositive(glass.advancedProfile.maxDiameterMm));
    (glass.advancedProfile.sections ?? []).forEach((section) => {
      candidates.push(toPositive(section.diameterMm));
    });
  }

  if (glass.advancedProfileEnabled) {
    (glass.profileSegments ?? []).forEach((segment) => {
      candidates.push(toPositive(segment.diameterMm));
    });
  }

  return Math.max(0, ...candidates);
}

function getSpacerDesiredOpticalAirGapMm(spacer: Extract<StackItem, { type: "spacer" }> | undefined): number {
  if (!spacer) return 0;
  if (toPositive(spacer.desiredOpticalAirGapMm) > 0) return spacer.desiredOpticalAirGapMm as number;
  return toPositive(spacer.thicknessMm);
}

function getSpacerPrintedThicknessMm(spacer: Extract<StackItem, { type: "spacer" }> | undefined): number {
  if (!spacer) return 0;
  if (toPositive(spacer.physicalSpacerThicknessMm) > 0) return spacer.physicalSpacerThicknessMm as number;
  return toPositive(spacer.thicknessMm);
}

function getSpacerThicknessSource(
  spacer: Extract<StackItem, { type: "spacer" }> | undefined
): "same_as_airspace" | "calculated_from_cup_offsets" | "manual_override" {
  if (!spacer) return "same_as_airspace";
  return spacer.physicalSpacerThicknessSource === "calculated_from_cup_offsets" ||
    spacer.physicalSpacerThicknessSource === "manual_override"
    ? spacer.physicalSpacerThicknessSource
    : "same_as_airspace";
}

function getSpacerInsertedItemsTotalThicknessMm(spacer: Extract<StackItem, { type: "spacer" }> | undefined): number {
  if (!spacer) return 0;
  if (toPositive(spacer.insertedItemsTotalThicknessMm) > 0) return spacer.insertedItemsTotalThicknessMm as number;
  return getAirspaceInsertedItemsTotalThicknessMm(spacer.insertedItems);
}

function resolveCascadeSourceGlass(project: LensProject): Extract<StackItem, { type: "glass" }> | undefined {
  const glasses = project.stackItems.filter(
    (item): item is Extract<StackItem, { type: "glass" }> => item.type === "glass"
  );
  if (!glasses.length) return undefined;
  return glasses.reduce((best, current) =>
    getMeasuredGlassMaxDiameterMm(current) > getMeasuredGlassMaxDiameterMm(best) ? current : best
  );
}

function getGlassProfileLengthMm(glass?: Extract<StackItem, { type: "glass" }>): number | undefined {
  if (!glass) return undefined;

  if (glass.advancedProfile?.enabled) {
    const advancedSectionsLength = (glass.advancedProfile.sections ?? []).reduce(
      (sum, section) => sum + toPositive(section.lengthMm),
      0
    );
    if (advancedSectionsLength > 0) {
      return advancedSectionsLength;
    }
    if (toPositive(glass.advancedProfile.totalLengthMm) > 0) {
      return glass.advancedProfile.totalLengthMm;
    }
  }

  if (glass.advancedProfileEnabled) {
    const profileDepth = (glass.profileSegments ?? []).reduce(
      (sum, segment) => sum + toPositive(segment.depthMm),
      0
    );
    if (profileDepth > 0) {
      return profileDepth;
    }
  }

  const thickness = toPositive(glass.thicknessMm);
  return thickness > 0 ? thickness : undefined;
}

function isAdvancedSteppedCup(glass?: Extract<StackItem, { type: "glass" }>): boolean {
  if (!glass) return false;
  if (glass.advancedProfile?.enabled) return true;
  return Boolean(glass.advancedProfileEnabled && (glass.profileSegments?.length ?? 0) > 0);
}

function getElementCupRearLipDefaultMm(glass: Extract<StackItem, { type: "glass" }> | undefined, defaults: CadDefaults): number {
  return Math.max(defaults.retainingLipMm, 1.2);
}

function estimateLensCupDepthMm(
  glass: Extract<StackItem, { type: "glass" }> | undefined,
  defaults: CadDefaults
): number | undefined {
  const profileLengthMm = getGlassProfileLengthMm(glass);
  if (!profileLengthMm || profileLengthMm <= 0) return undefined;
  const rearLipMm = getElementCupRearLipDefaultMm(glass, defaults);
  return profileLengthMm + rearLipMm + 0.5;
}

function resolveSlidingCarrierLengthMm({
  project,
  fallbackLengthMm,
  lengthSource,
  manualLengthMm
}: {
  project: LensProject;
  fallbackLengthMm: number;
  lengthSource: SlidingCarrierLengthSource;
  manualLengthMm: number;
}): { lengthMm: number; source: CarrierLengthDerivedSource } {
  if (lengthSource === "manual") {
    const manual = Number.isFinite(manualLengthMm) ? manualLengthMm : 0;
    return { lengthMm: Number(Math.max(8, manual).toFixed(3)), source: "manual" };
  }

  const stackLengthMm = getTotalStackLength(project.stackItems);
  if (stackLengthMm > 0) {
    return {
      lengthMm: Number(Math.max(8, stackLengthMm + CARRIER_LENGTH_MARGIN_MM).toFixed(3)),
      source: "optical_stack_length"
    };
  }
  const fallback = Number.isFinite(fallbackLengthMm) ? fallbackLengthMm : 0;
  return { lengthMm: Number(Math.max(8, fallback).toFixed(3)), source: "manual" };
}

function deriveCascadeSizing({
  project,
  defaults,
  focusDerived,
  slidingCarrierOverrides
}: {
  project: LensProject;
  defaults: CadDefaults;
  focusDerived: ReturnType<typeof getFocusTravelDerived>;
  slidingCarrierOverrides?: SlidingCarrierOverrides;
}): CascadeSizing {
  const sourceGlass = resolveCascadeSourceGlass(project);
  const measuredSourceGlassMaxDiameter = getMeasuredGlassMaxDiameterMm(sourceGlass);
  const fallbackLargestGlassDiameter = getLargestGlassDiameter(project.stackItems);
  const sourceGlassMaxDiameterMm =
    measuredSourceGlassMaxDiameter > 0 ? measuredSourceGlassMaxDiameter : fallbackLargestGlassDiameter;
  const opticalStackLengthMm = getTotalStackLength(project.stackItems);

  const cupDepthMm = estimateLensCupDepthMm(sourceGlass, defaults);
  const minimumCupWallThicknessMm = DEFAULT_MINIMUM_CUP_WALL_THICKNESS_MM;
  const manualTargetStackOuterDiameterMm = toPositive(defaults.targetStackOuterDiameterMm);
  const autoTargetStackOuterDiameterMm = roundUpToIncrement(
    Math.max(4, sourceGlassMaxDiameterMm + minimumCupWallThicknessMm * 2),
    DEFAULT_SHARED_STACK_ROUNDING_INCREMENT_MM
  );
  const targetStackOuterDiameterSource: CascadeSizing["targetStackOuterDiameterSource"] =
    manualTargetStackOuterDiameterMm > 0 ? "manual" : "largest_glass_auto";
  const targetStackOuterDiameterMm = Number(
    Math.max(4, manualTargetStackOuterDiameterMm > 0 ? manualTargetStackOuterDiameterMm : autoTargetStackOuterDiameterMm).toFixed(3)
  );
  const cupOuterDiameterMm = targetStackOuterDiameterMm;

  const cupToCarrierClearanceMm = Number(
    Math.max(0, defaults.cupToCarrierClearanceMm ?? DEFAULT_CUP_TO_CARRIER_CLEARANCE_MM).toFixed(3)
  );
  const manualCarrierInnerDiameterMm = toPositive(defaults.carrierInnerDiameterMm);
  const carrierInnerDiameterSource: CascadeSizing["carrierInnerDiameterSource"] =
    manualCarrierInnerDiameterMm > 0 ? "manual" : "auto";
  const carrierInnerDiameterMm = Number(
    (
      manualCarrierInnerDiameterMm > 0
        ? manualCarrierInnerDiameterMm
        : targetStackOuterDiameterMm + cupToCarrierClearanceMm
    ).toFixed(3)
  );
  const manualCarrierWallThicknessMm = toPositive(defaults.carrierWallThicknessMm);
  const carrierWallThicknessSource: CascadeSizing["carrierWallThicknessSource"] =
    manualCarrierWallThicknessMm > 0 ? "manual" : "auto";
  const carrierWallThicknessMm = Number(
    (
      manualCarrierWallThicknessMm > 0
        ? manualCarrierWallThicknessMm
        : DEFAULT_CARRIER_WALL_THICKNESS_MM
    ).toFixed(3)
  );
  const carrierOuterDiameterMm = Number((carrierInnerDiameterMm + carrierWallThicknessMm * 2).toFixed(3));

  const carrierToBarrelClearanceMm = Number(
    Math.max(0, defaults.carrierToBarrelClearanceMm ?? DEFAULT_CARRIER_TO_BARREL_CLEARANCE_MM).toFixed(3)
  );
  const manualFixedBarrelInnerDiameterMm = toPositive(defaults.fixedBarrelInnerDiameterMm);
  const fixedBarrelInnerDiameterSource: CascadeSizing["fixedBarrelInnerDiameterSource"] =
    manualFixedBarrelInnerDiameterMm > 0 ? "manual" : "auto";
  const fixedBarrelInnerDiameterMm = Number(
    (
      manualFixedBarrelInnerDiameterMm > 0
        ? manualFixedBarrelInnerDiameterMm
        : carrierOuterDiameterMm + carrierToBarrelClearanceMm
    ).toFixed(3)
  );
  const manualFixedBarrelWallThicknessMm = toPositive(defaults.fixedBarrelWallThicknessMm);
  const fixedBarrelWallThicknessSource: CascadeSizing["fixedBarrelWallThicknessSource"] =
    manualFixedBarrelWallThicknessMm > 0 ? "manual" : "auto";
  const fixedBarrelWallThicknessMm = Number(
    (
      manualFixedBarrelWallThicknessMm > 0
        ? manualFixedBarrelWallThicknessMm
        : DEFAULT_FIXED_BARREL_WALL_THICKNESS_MM
    ).toFixed(3)
  );
  const fixedBarrelOuterDiameterMm = Number((fixedBarrelInnerDiameterMm + fixedBarrelWallThicknessMm * 2).toFixed(3));

  const focusTravelMm = focusDerived.recommendedPrototypeTravelMm;
  const carrierLengthResolved = resolveSlidingCarrierLengthMm({
    project,
    fallbackLengthMm: slidingCarrierOverrides?.manualLengthMm ?? focusTravelMm ?? 48,
    lengthSource: slidingCarrierOverrides?.lengthSource ?? "lens_cup_or_stack",
    manualLengthMm: slidingCarrierOverrides?.manualLengthMm ?? 48
  });

  const slotLengthSource: SlotLengthSource =
    (focusDerived.recommendedSlotLengthMm && focusDerived.recommendedSlotLengthMm > 0) ||
    (focusDerived.recommendedPrototypeTravelMm && focusDerived.recommendedPrototypeTravelMm > 0)
      ? "focus_travel"
      : "manual_default";
  const slotLengthMm = Number(
    (
      focusDerived.recommendedSlotLengthMm && focusDerived.recommendedSlotLengthMm > 0
        ? focusDerived.recommendedSlotLengthMm
        : focusDerived.recommendedPrototypeTravelMm && focusDerived.recommendedPrototypeTravelMm > 0
        ? focusDerived.recommendedPrototypeTravelMm + 2.0
        : DEFAULT_SLOT_LENGTH_WITHOUT_FOCUS_TRAVEL_MM
    ).toFixed(3)
  );
  const slotStartFromMainBarrelMm = Math.max(0, defaults.plSlotStartFromMainBarrelMm ?? 8.0);
  const barrelEndMarginMm = DEFAULT_BARREL_END_MARGIN_MM;
  const mainBarrelLengthMm = Number((slotStartFromMainBarrelMm + slotLengthMm + barrelEndMarginMm).toFixed(3));

  return {
    sourceGlass,
    sourceGlassMaxDiameterMm,
    opticalStackLengthMm,
    cupDepthMm,
    cupOuterDiameterMm,
    minimumCupWallThicknessMm,
    cupToCarrierClearanceMm,
    targetStackOuterDiameterMm,
    targetStackOuterDiameterSource,
    carrierLengthMm: carrierLengthResolved.lengthMm,
    carrierLengthSource: carrierLengthResolved.source,
    carrierInnerDiameterMm,
    carrierInnerDiameterSource,
    carrierWallThicknessMm,
    carrierWallThicknessSource,
    carrierOuterDiameterMm,
    carrierToBarrelClearanceMm,
    fixedBarrelInnerDiameterMm,
    fixedBarrelInnerDiameterSource,
    fixedBarrelWallThicknessMm,
    fixedBarrelWallThicknessSource,
    fixedBarrelOuterDiameterMm,
    slotLengthMm,
    slotLengthSource,
    slotStartFromMainBarrelMm,
    barrelEndMarginMm,
    mainBarrelLengthMm
  };
}

function getAdvancedProfileSectionSum(profile: ElementCupParams["advancedProfile"] | undefined): number {
  if (!profile?.sections?.length) return 0;
  return profile.sections.reduce((sum, section) => sum + toPositive(section.lengthMm), 0);
}

function buildInsertionSafeBoreSections(
  profile: ElementCupParams["advancedProfile"] | undefined,
  seatClearanceMm: number,
  insertionSide: ResolvedCupInsertionSide = "front"
): Array<{ zStartMm: number; zEndMm: number; diameterMm: number }> {
  if (!profile?.enabled) return [];
  const orderedSections = (profile.sections ?? [])
    .slice()
    .sort((a, b) => a.index - b.index)
    .filter((section) => toPositive(section.diameterMm) > 0 && toPositive(section.lengthMm) > 0);
  const sections = insertionSide === "rear" ? orderedSections.slice().reverse() : orderedSections;
  if (!sections.length || toPositive(profile.maxDiameterMm) <= 0) return [];

  let maxSectionIndex = 0;
  let smallestDelta = Number.POSITIVE_INFINITY;
  sections.forEach((section, index) => {
    const delta = Math.abs(section.diameterMm - profile.maxDiameterMm);
    if (delta < smallestDelta) {
      smallestDelta = delta;
      maxSectionIndex = index;
    }
  });

  const bores: Array<{ zStartMm: number; zEndMm: number; diameterMm: number }> = [];
  let z = 0;
  sections.forEach((section, index) => {
    const zStart = z;
    const zEnd = z + section.lengthMm;
    z = zEnd;
    const measuredDiameter = index <= maxSectionIndex ? profile.maxDiameterMm : section.diameterMm;
    const boreDiameter = measuredDiameter + seatClearanceMm;
    const previous = bores[bores.length - 1];
    if (previous && Math.abs(previous.diameterMm - boreDiameter) < 0.0001) {
      previous.zEndMm = zEnd;
      return;
    }
    bores.push({
      zStartMm: zStart,
      zEndMm: zEnd,
      diameterMm: boreDiameter
    });
  });

  return bores;
}

function createPayload(
  project: LensProject,
  partType: CadPartType,
  source?: StackItem,
  fixedPlOverrides?: { barrelAttachZMm: number; plOverlapMm: number },
  slidingCarrierOverrides?: SlidingCarrierOverrides,
  cascadeSizing?: CascadeSizing,
  guidePinOverrides?: GuidePinOverrides
): ScadPayload {
  const defaults = project.cadDefaults;
  const sourceName = source?.name ?? "part";
  const partName = `${partType}_${safeFileName(sourceName || "part")}`;
  const focusDerived = getFocusTravelDerived(project);
  const plRearNeckOuter = defaults.plRearNeckOuterDiameterMm ?? 31.0;
  const plRearNeckInner = defaults.plRearNeckInnerDiameterMm ?? 26.0;
  const plRearNeckLength = defaults.plRearNeckLengthMm ?? 12.0;
  const plLockClearanceLength = defaults.plLockingClearanceLengthMm ?? 12.0;
  const plLockClearanceDiameter = defaults.plLockingClearanceDiameterMm ?? 42.0;
  const plStepUpStart = defaults.plStepUpStartFromFlangeMm ?? 12.0;
  const plSlotCount = Math.max(2, Math.round(defaults.plSlotCount ?? 2));
  const plSlotAngleOffset = defaults.plSlotAngleOffsetDeg ?? 0;
  const plSlotStartZ = defaults.plSlotStartZMm ?? 13.0;
  const plPinDiameter = Math.max(1, defaults.plPinDiameterMm ?? defaults.camPinDiameterMm ?? 2);
  const plPinClearance = Math.max(0.1, defaults.plPinClearanceMm ?? 0.3);
  const cascade =
    cascadeSizing ??
    deriveCascadeSizing({
      project,
      defaults,
      focusDerived,
      slidingCarrierOverrides
    });
  const guidePinSizing = deriveGuidePinSizing(defaults, cascade);

  switch (partType) {
    case "element_cup": {
      const glass =
        (source?.type === "glass" ? source : undefined) ??
        cascade.sourceGlass;
      const advancedProfile = normalizeAdvancedProfileForCup(glass);
      const resolvedCupInsertionSide = resolveCupInsertionSide(glass, advancedProfile);
      const requestedCupRetainingSide =
        glass?.cupRetainingSide === "front" ||
        glass?.cupRetainingSide === "rear" ||
        glass?.cupRetainingSide === "both" ||
        glass?.cupRetainingSide === "none"
          ? glass.cupRetainingSide
          : "auto";
      const resolvedCupRetainingSide = resolveCupRetainingSide(glass, resolvedCupInsertionSide);
      const retainingLipEnabled = glass?.retainingLipEnabled ?? true;
      const retainingLipThicknessMm = Number(
        Math.max(0, glass?.retainingLipThicknessMm ?? Math.max(defaults.retainingLipMm, 1.2)).toFixed(3)
      );
      const steppedLargeDiameterMm = toPositive(glass?.largeDiameterMm);
      const steppedSmallDiameterMm = toPositive(glass?.smallDiameterMm);
      const steppedLargeSectionThicknessMm = toPositive(glass?.largeSectionThicknessMm);
      const steppedSmallSectionThicknessMm = toPositive(glass?.smallSectionThicknessMm);
      const steppedProfile =
        glass?.hasSteppedProfile &&
        steppedLargeDiameterMm > 0 &&
        steppedSmallDiameterMm > 0 &&
        steppedLargeSectionThicknessMm > 0 &&
        steppedSmallSectionThicknessMm > 0
          ? {
              largeDiameterMm: steppedLargeDiameterMm,
              smallDiameterMm: steppedSmallDiameterMm,
              largeSectionThicknessMm: steppedLargeSectionThicknessMm,
              smallSectionThicknessMm: steppedSmallSectionThicknessMm,
              stepDirection: glass.stepDirection ?? "unknown"
            }
          : undefined;
      const profileSegments = advancedProfile?.enabled
        ? (advancedProfile.sections ?? [])
            .filter((section) => section.diameterMm > 0 && section.lengthMm > 0)
            .map((section) => ({
              name: section.label,
              diameterMm: section.diameterMm,
              depthMm: section.lengthMm
            }))
        : glass?.advancedProfileEnabled
          ? (glass.profileSegments ?? []).filter((segment) => segment.diameterMm > 0 && segment.depthMm > 0)
          : [];
      const profileDepth =
        profileSegments.length > 0
          ? profileSegments.reduce((sum, segment) => sum + segment.depthMm, 0)
          : undefined;
      const localGlassMaxDiameterMm = getMeasuredGlassMaxDiameterMm(glass);
      const glassDiameterMm =
        localGlassMaxDiameterMm > 0
          ? localGlassMaxDiameterMm
          : glass?.diameterMm ?? cascade.sourceGlassMaxDiameterMm ?? defaults.defaultInnerDiameterMm - 4;
      const localCupDepthMm = estimateLensCupDepthMm(glass, defaults);
      const seatClearanceMm = defaults.printToleranceMm;
      const resolvedOuterDiameter = cascade.cupOuterDiameterMm;
      const advancedProfileLengthMm = getAdvancedProfileTotalLengthMm(advancedProfile);
      const profileLengthMm =
        (typeof profileDepth === "number" && profileDepth > 0
          ? profileDepth
          : advancedProfileLengthMm > 0
            ? advancedProfileLengthMm
            : toPositive(glass?.thicknessMm));
      const retainingSideForGeometry: ResolvedCupRetainingSide =
        resolvedCupRetainingSide === "none"
          ? "none"
          : resolvedCupInsertionSide === "front"
            ? "rear"
            : "front";
      const rearLipMm =
        retainingLipEnabled && retainingSideForGeometry !== "none" ? retainingLipThicknessMm : 0;
      const resolvedCupDepthMm = Number(
        (
          localCupDepthMm ??
          Math.max(0.5, profileLengthMm + rearLipMm + 0.5)
        ).toFixed(3)
      );
      const cupOffsetEstimate = estimateCupOffsetsForGlass(glass, defaults);
      const opticalClearApertureMm = toPositive(glass?.clearApertureMm);
      const retainingLipInnerDiameterMm = Number(
        Math.max(
          0.4,
          toPositive(glass?.retainingLipInnerDiameterMm) > 0
            ? (glass?.retainingLipInnerDiameterMm as number)
            : opticalClearApertureMm > 0
              ? opticalClearApertureMm + 1.2
              : Math.max(8, glassDiameterMm - 2.4)
        ).toFixed(3)
      );

      return {
        type: "element_cup",
        params: {
          partName,
          glassDiameterMm,
          glassThicknessMm: profileDepth ?? glass?.thicknessMm ?? defaults.partThicknessMm,
          steppedProfile,
          advancedProfile,
          profileSegments: profileSegments.length ? profileSegments : undefined,
          seatClearanceMm,
          wallThicknessMm: Number(defaults.wallThicknessMm.toFixed(3)),
          outerDiameterMm: Number(resolvedOuterDiameter.toFixed(3)),
          retainingLipMm: retainingLipEnabled ? retainingLipThicknessMm : 0,
          rearLipMm: Number(rearLipMm.toFixed(3)),
          cupInsertionSide: glass?.cupInsertionSide ?? "auto",
          cupRetainingSide: requestedCupRetainingSide,
          resolvedCupInsertionSide,
          resolvedCupRetainingSide: retainingSideForGeometry,
          retainingLipEnabled,
          retainingLipThicknessMm,
          retainingLipInnerDiameterMm,
          cupFrontOffsetMm: cupOffsetEstimate.cupFrontOffsetMm,
          cupRearOffsetMm: cupOffsetEstimate.cupRearOffsetMm,
          cupDepthMm: resolvedCupDepthMm,
          facets: defaults.facets
        }
      };
    }
    case "spacer_ring": {
      const spacer = source?.type === "spacer" ? source : undefined;
      const spacerPartName = `spacer_air_gap_${safeFileName(sourceName || "ring")}`;
      const defaultSpacerInnerDiameterMm = 30.0;
      const resolvedSpacerInnerDiameterMm =
        toPositive(spacer?.innerDiameterMm) > 0 ? (spacer?.innerDiameterMm as number) : defaultSpacerInnerDiameterMm;
      const resolvedSpacerOuterDiameterMm =
        cascade.targetStackOuterDiameterMm > 0
          ? cascade.targetStackOuterDiameterMm
          : toPositive(spacer?.outerDiameterMm) > 0
            ? (spacer?.outerDiameterMm as number)
            : defaults.defaultOuterDiameterMm;
      const desiredOpticalAirGapMm =
        getSpacerDesiredOpticalAirGapMm(spacer) > 0
          ? getSpacerDesiredOpticalAirGapMm(spacer)
          : defaults.partThicknessMm;
      const spacerThicknessSource = getSpacerThicknessSource(spacer);
      const insertedItemsTotalThicknessMm = getSpacerInsertedItemsTotalThicknessMm(spacer);
      const orderedItems = [...project.stackItems].sort((a, b) => a.positionIndex - b.positionIndex);
      const spacerIndex = spacer ? orderedItems.findIndex((item) => item.id === spacer.id) : -1;
      const previousGlass = spacerIndex >= 0 ? getNearestGlassOnSide(orderedItems, spacerIndex, -1) : undefined;
      const nextGlass = spacerIndex >= 0 ? getNearestGlassOnSide(orderedItems, spacerIndex, 1) : undefined;
      const previousCupOffsets = estimateCupOffsetsForGlass(previousGlass, defaults);
      const nextCupOffsets = estimateCupOffsetsForGlass(nextGlass, defaults);
      const cupOffsetCompensationAvailable = Boolean(previousGlass && nextGlass);
      const previousCupRearOffsetMm = cupOffsetCompensationAvailable ? previousCupOffsets.cupRearOffsetMm : 0;
      const nextCupFrontOffsetMm = cupOffsetCompensationAvailable ? nextCupOffsets.cupFrontOffsetMm : 0;
      const calculatedPhysicalSpacerThicknessMm = Number(
        (
          desiredOpticalAirGapMm -
          previousCupRearOffsetMm -
          nextCupFrontOffsetMm -
          insertedItemsTotalThicknessMm
        ).toFixed(3)
      );
      const manualPrintedThicknessMm = getSpacerPrintedThicknessMm(spacer);
      const resolvedPrintedSpacerThicknessRawMm =
        spacerThicknessSource === "manual_override"
          ? (manualPrintedThicknessMm > 0 ? manualPrintedThicknessMm : desiredOpticalAirGapMm)
          : spacerThicknessSource === "calculated_from_cup_offsets" && cupOffsetCompensationAvailable
            ? calculatedPhysicalSpacerThicknessMm
            : desiredOpticalAirGapMm;
      const resolvedPrintedSpacerThicknessMm = Math.max(0.01, resolvedPrintedSpacerThicknessRawMm);

      return {
        type: "spacer_ring",
        params: {
          partName: spacerPartName,
          innerDiameterMm: Number(resolvedSpacerInnerDiameterMm.toFixed(3)),
          outerDiameterMm: Number(resolvedSpacerOuterDiameterMm.toFixed(3)),
          thicknessMm: Number(resolvedPrintedSpacerThicknessMm.toFixed(3)),
          desiredOpticalAirGapMm: Number(desiredOpticalAirGapMm.toFixed(3)),
          physicalSpacerThicknessMm: Number(resolvedPrintedSpacerThicknessRawMm.toFixed(3)),
          physicalSpacerThicknessSource: spacerThicknessSource,
          airspaceMeasurementType: spacer?.airspaceMeasurementType ?? "unknown",
          airspaceConfidence: spacer?.airspaceConfidence ?? "unknown",
          previousCupRearOffsetMm: Number(previousCupRearOffsetMm.toFixed(3)),
          nextCupFrontOffsetMm: Number(nextCupFrontOffsetMm.toFixed(3)),
          insertedItemsTotalThicknessMm: Number(insertedItemsTotalThicknessMm.toFixed(3)),
          calculatedPhysicalSpacerThicknessMm,
          spacerThicknessSource: spacerThicknessSource,
          hasAntiReflectionGrooves: Boolean(spacer?.hasAntiReflectionGrooves),
          chamferEnabled: Boolean(spacer?.chamferEnabled),
          chamferMm: spacer?.chamferMm ?? 0.2,
          facets: defaults.facets
        }
      };
    }
    case "iris_disk": {
      const iris = source?.type === "iris" ? source : undefined;
      return {
        type: "iris_disk",
        params: {
          partName,
          diskDiameterMm: iris?.diskDiameterMm ?? defaults.defaultOuterDiameterMm,
          apertureDiameterMm: iris?.apertureDiameterMm ?? defaults.defaultInnerDiameterMm * 0.4,
          thicknessMm: iris?.thicknessMm ?? 1.2,
          isOval: Boolean(iris?.isOval),
          ovalWidthMm: iris?.ovalWidthMm,
          ovalHeightMm: iris?.ovalHeightMm,
          tabEnabled: Boolean(iris?.tabEnabled),
          tabWidthMm: iris?.tabWidthMm,
          tabLengthMm: iris?.tabLengthMm,
          facets: defaults.facets
        }
      };
    }
    case "diffusion_holder": {
      const diff = source?.type === "diffusion" ? source : undefined;
      return {
        type: "diffusion_holder",
        params: {
          partName,
          diskDiameterMm: diff?.diskDiameterMm ?? defaults.defaultInnerDiameterMm,
          clearCenterDiameterMm: diff?.clearCenterDiameterMm ?? 12,
          diffusionOuterDiameterMm: diff?.diffusionOuterDiameterMm ?? 24,
          holderThicknessMm: diff?.thicknessMm ?? defaults.partThicknessMm,
          wallThicknessMm: defaults.wallThicknessMm,
          retainingLipMm: defaults.retainingLipMm,
          facets: defaults.facets
        }
      };
    }
    case "retaining_ring": {
      const ring = source?.type === "retaining_ring" ? source : undefined;
      return {
        type: "retaining_ring",
        params: {
          partName,
          innerDiameterMm: ring?.innerDiameterMm ?? defaults.defaultInnerDiameterMm,
          outerDiameterMm: ring?.outerDiameterMm ?? defaults.defaultOuterDiameterMm,
          thicknessMm: ring?.thicknessMm ?? defaults.partThicknessMm * 0.8,
          notchCount: ring?.notchCount ?? 2,
          notchWidthMm: 2,
          notchDepthMm: 1.5,
          facets: defaults.facets
        }
      };
    }
    case "fixed_pl_barrel_with_slots": {
      const mainBarrelInner = cascade.fixedBarrelInnerDiameterMm;
      const mainBarrelOuter = cascade.fixedBarrelOuterDiameterMm;
      const pinDiameter = plPinDiameter;
      const pinClearance = plPinClearance;
      const slotWidth = Number((pinDiameter + pinClearance).toFixed(3));
      const slotLength = cascade.slotLengthMm;
      const defaultPlClearanceOuter = Number((mainBarrelInner + 1.5).toFixed(3));
      const requestedPlClearanceOuter = Number.isFinite(defaults.plClearanceOuterDiameterMm ?? Number.NaN)
        ? (defaults.plClearanceOuterDiameterMm as number)
        : undefined;
      const plClearanceOuterDiameter = Number(
        (
          typeof requestedPlClearanceOuter === "number"
            ? Math.max(requestedPlClearanceOuter, mainBarrelInner + 0.01)
            : defaultPlClearanceOuter
        ).toFixed(3)
      );
      const plClearanceLength = Math.max(0.1, defaults.plClearanceLengthMm ?? 4.0);
      const slotStartFromMainBarrel = cascade.slotStartFromMainBarrelMm;
      const stepUpStart = Math.max(plLockClearanceLength, plStepUpStart);
      const plInterfaceOuterDiameter = Math.max(1, defaults.plInterfaceOuterDiameterMm ?? 54.9);
      const connectorDiscEnabledByFit = mainBarrelOuter < plInterfaceOuterDiameter;
      const connectorDiscEnabled = connectorDiscEnabledByFit || (defaults.connectorDiscEnabled ?? true);
      const connectorDiscThickness = Math.max(0, defaults.connectorDiscThicknessMm ?? 0.8);
      const connectorOverlapIntoPl = Math.max(0, defaults.connectorOverlapIntoPlMm ?? 0.8);
      const barrelToDiscOverlap = Math.max(
        0,
        defaults.barrelToDiscOverlapMm ?? defaults.connectorDiscOverlapWithBarrelMm ?? 0.4
      );
      const connectorDiscOuterDiameterDefault = plInterfaceOuterDiameter;
      const connectorDiscOuterDiameter = Math.max(
        mainBarrelOuter,
        Number.isFinite(defaults.connectorDiscOuterDiameterMm ?? Number.NaN)
          ? (defaults.connectorDiscOuterDiameterMm as number)
          : connectorDiscOuterDiameterDefault
      );
      const connectorDiscInnerDiameter = mainBarrelInner;
      const connectorDiscThicknessEffective = connectorDiscEnabled ? connectorDiscThickness : 0;
      const mainBarrelLength = Math.max(0.1, cascade.mainBarrelLengthMm);
      const totalLength = Number((stepUpStart + connectorDiscThicknessEffective + mainBarrelLength).toFixed(3));
      const plReferenceStlPath = derivePlStlPathFromStepPath(defaults.plStepReferencePath);
      const rawRotateX = project.cadDefaults.plImportedStlRotateXDeg ?? 0;
      const rawRotateY = project.cadDefaults.plImportedStlRotateYDeg ?? 0;
      const rawRotateZ = project.cadDefaults.plImportedStlRotateZDeg ?? 0;
      // Keep PL mount orientation stable for V1 sliding prototype.
      // Do not auto-flip or inherit old flip presets here.
      const plReferenceFlipX = false;
      const plReferenceFlipY = false;
      const plReferenceFlipZ = false;
      const plReferenceOverlapMm = Math.max(
        2.0,
        Number.isFinite(fixedPlOverrides?.plOverlapMm ?? Number.NaN)
          ? (fixedPlOverrides?.plOverlapMm as number)
          : (project.cadDefaults.plReferenceOverlapMm ?? 2.0)
      );
      const barrelAttachZMm = Number.isFinite(fixedPlOverrides?.barrelAttachZMm ?? Number.NaN)
        ? (fixedPlOverrides?.barrelAttachZMm as number)
        : (project.cadDefaults.plBarrelAttachZMm ?? 0.0);
      return {
        type: "fixed_pl_barrel_with_slots",
        params: {
          partName,
          innerDiameterMm: mainBarrelInner,
          outerDiameterMm: mainBarrelOuter,
          lengthMm: totalLength,
          rearNeckOuterDiameterMm: plRearNeckOuter,
          rearNeckInnerDiameterMm: plRearNeckInner,
          rearNeckLengthMm: plRearNeckLength,
          mainBarrelOuterDiameterMm: mainBarrelOuter,
          mainBarrelInnerDiameterMm: mainBarrelInner,
          mainBarrelLengthMm: mainBarrelLength,
          plClearanceOuterDiameterMm: plClearanceOuterDiameter,
          plClearanceLengthMm: plClearanceLength,
          plLockingClearanceLengthMm: plLockClearanceLength,
          plLockingClearanceDiameterMm: plLockClearanceDiameter,
          stepUpStartFromPLFlangeMm: stepUpStart,
          slotCount: plSlotCount,
          slotAngleOffsetDeg: plSlotAngleOffset,
          slotLengthMm: Math.max(slotLength, 6),
          slotWidthMm: slotWidth,
          slotStartZMm: plSlotStartZ,
          slotStartFromMainBarrelMm: slotStartFromMainBarrel,
          slotCutDepthMm: 9.0,
          pinDiameterMm: pinDiameter,
          pinClearanceMm: pinClearance,
          plInterfaceOuterDiameterMm: plInterfaceOuterDiameter,
          connectorDiscEnabled,
          connectorDiscOuterDiameterMm: connectorDiscOuterDiameter,
          connectorDiscInnerDiameterMm: connectorDiscInnerDiameter,
          connectorDiscThicknessMm: connectorDiscThickness,
          connectorOverlapIntoPlMm: connectorOverlapIntoPl,
          barrelToDiscOverlapMm: barrelToDiscOverlap,
          connectorDiscOverlapWithBarrelMm: barrelToDiscOverlap,
          includePlReferenceMount: true,
          useImportedPlReferenceStl: true,
          plReferenceStlPath,
          plReferenceMountThicknessMm: plLockClearanceLength,
          plReferenceMountOuterDiameterMm: Math.max(
            plLockClearanceDiameter > 0 ? plLockClearanceDiameter + 6 : 0,
            plRearNeckOuter + 8
          ),
          plReferenceMountInnerDiameterMm: plRearNeckInner,
          plReferenceImportedHeightMm: Math.max(1, project.cadDefaults.plImportedStlHeightMm ?? 9),
          plReferenceFlipX,
          plReferenceFlipY,
          plReferenceFlipZ,
          plReferenceRotateXDeg: rawRotateX,
          plReferenceRotateYDeg: rawRotateY,
          plReferenceRotateZDeg: rawRotateZ,
          plReferenceOffsetXMm: project.cadDefaults.plImportedStlOffsetXMm ?? 0,
          plReferenceOffsetYMm: project.cadDefaults.plImportedStlOffsetYMm ?? 0,
          plReferenceOffsetZMm: project.cadDefaults.plImportedStlOffsetZMm ?? 0,
          barrelAttachZMm,
          plReferenceOverlapMm,
          fuseBarrelToPlReference: project.cadDefaults.plFuseBarrelToReference ?? true,
          facets: defaults.facets
        }
      };
    }
    case "sliding_optical_carrier": {
      const carrierLength = cascade.carrierLengthMm;
      const pinHoleDiameter = Number((plPinDiameter + plPinClearance).toFixed(3));
      const pinBossDiameter = Number((pinHoleDiameter + 3).toFixed(3));
      const pinHoleZ = Number((carrierLength * 0.5).toFixed(3));
      const sourceGlass =
        (source?.type === "glass" ? source : undefined) ??
        cascade.sourceGlass;
      const opticalClearApertureMm = toPositive(sourceGlass?.clearApertureMm);
      const retainingLipInnerDiameterMm = Number(
        Math.max(30.0, opticalClearApertureMm > 0 ? opticalClearApertureMm + 2.0 : 30.0).toFixed(3)
      );
      return {
        type: "sliding_optical_carrier",
        params: {
          partName,
          innerDiameterMm: cascade.carrierInnerDiameterMm,
          outerDiameterMm: cascade.carrierOuterDiameterMm,
          lengthMm: carrierLength,
          startZMm: 0,
          pinHoleCount: 2,
          pinHoleAngleOffsetDeg: plSlotAngleOffset,
          pinHoleDiameterMm: pinHoleDiameter,
          pinHoleZMm: pinHoleZ,
          addPinBosses: false,
          pinBossDiameterMm: pinBossDiameter,
          pinBossHeightMm: 2,
          retainingLipEnabled: true,
          retainingLipPosition: "rear",
          retainingLipThicknessMm: 1.2,
          retainingLipInnerDiameterMm,
          opticalClearApertureMm:
            opticalClearApertureMm > 0 ? Number(opticalClearApertureMm.toFixed(3)) : undefined,
          facets: defaults.facets
        }
      };
    }
    case "guide_pin": {
      const resolvedShaftDiameterMm = Number(
        Math.max(0.5, guidePinOverrides?.pinShaftDiameterMm ?? guidePinSizing.autoPinShaftDiameterMm).toFixed(3)
      );
      const minimumShaftLengthMm = Math.max(
        DEFAULT_GUIDE_PIN_SHAFT_LENGTH_MM,
        guidePinSizing.minimumRecommendedShaftLengthMm
      );
      const resolvedShaftLengthMm = Number(
        Math.max(1.0, guidePinOverrides?.pinShaftLengthMm ?? minimumShaftLengthMm).toFixed(3)
      );
      const resolvedHeadDiameterMm = Number(
        Math.max(
          resolvedShaftDiameterMm + 0.8,
          guidePinOverrides?.pinHeadDiameterMm ?? DEFAULT_GUIDE_PIN_HEAD_DIAMETER_MM
        ).toFixed(3)
      );
      const resolvedHeadThicknessMm = Number(
        Math.max(0.4, guidePinOverrides?.pinHeadThicknessMm ?? DEFAULT_GUIDE_PIN_HEAD_THICKNESS_MM).toFixed(3)
      );
      const resolvedTipChamferMm = Number(
        Math.max(0, guidePinOverrides?.tipChamferMm ?? DEFAULT_GUIDE_PIN_TIP_CHAMFER_MM).toFixed(3)
      );
      const resolvedQuantity = Math.max(
        1,
        Math.round(guidePinOverrides?.quantity ?? DEFAULT_GUIDE_PIN_QUANTITY)
      );
      return {
        type: "guide_pin",
        params: {
          partName,
          pinShaftDiameterMm: resolvedShaftDiameterMm,
          pinShaftLengthMm: resolvedShaftLengthMm,
          pinHeadDiameterMm: resolvedHeadDiameterMm,
          pinHeadThicknessMm: resolvedHeadThicknessMm,
          tipChamferMm: resolvedTipChamferMm,
          quantity: resolvedQuantity,
          slotWidthMm: guidePinSizing.slotWidthMm,
          carrierPinHoleDiameterMm: guidePinSizing.carrierPinHoleDiameterMm,
          fixedBarrelWallThicknessMm: guidePinSizing.fixedBarrelWallThicknessMm,
          carrierWallThicknessMm: guidePinSizing.carrierWallThicknessMm,
          facets: defaults.facets
        }
      };
    }
    case "main_barrel": {
      const barrel = source?.type === "barrel" ? source : undefined;
      const inner = barrel?.innerDiameterMm ?? getRecommendedBarrelInnerDiameter(project.stackItems, defaults);
      const outer = barrel?.outerDiameterMm ?? Math.max(inner + defaults.wallThicknessMm * 2, defaults.defaultOuterDiameterMm);
      const mainBarrelLength = estimateMainBarrelLengthMm(project, source);
      return {
        type: "main_barrel",
        params: {
          partName,
          innerDiameterMm: inner,
          outerDiameterMm: outer,
          lengthMm: mainBarrelLength,
          hasIrisSlot: Boolean(barrel?.hasIrisSlot),
          hasDiffusionSlot: Boolean(barrel?.hasDiffusionSlot),
          slotWidthMm: 4,
          slotLengthMm: 14,
          screwHoleCount: barrel?.screwHoleCount ?? 0,
          screwDiameterMm: defaults.screwDiameterMm,
          facets: defaults.facets
        }
      };
    }
    case "moving_carrier": {
      const barrel = source?.type === "barrel" ? source : undefined;
      const mainBarrelLength = estimateMainBarrelLengthMm(project, source);
      const inner = barrel?.innerDiameterMm ?? getRecommendedBarrelInnerDiameter(project.stackItems, defaults) - 1;
      const outer = barrel?.outerDiameterMm ?? getRecommendedBarrelOuterDiameter(project.stackItems, defaults) - 0.5;
      const carrierLength = Number(Math.max(18, Math.min(mainBarrelLength * 0.45, 42)).toFixed(1));
      return {
        type: "moving_carrier",
        params: {
          partName,
          innerDiameterMm: inner,
          outerDiameterMm: Math.max(outer, inner + defaults.wallThicknessMm),
          lengthMm: carrierLength,
          camPinDiameterMm: defaults.camPinDiameterMm,
          antiRotationKeyEnabled: true,
          facets: defaults.facets
        }
      };
    }
    case "cam_sleeve": {
      const barrel = source?.type === "barrel" ? source : undefined;
      const mainBarrelLength = estimateMainBarrelLengthMm(project, source);
      const inner = barrel?.outerDiameterMm ?? getRecommendedBarrelOuterDiameter(project.stackItems, defaults) + 0.5;
      const camSleeveLength = Number(Math.max(30, Math.min(mainBarrelLength * 0.8, 60)).toFixed(1));
      return {
        type: "cam_sleeve",
        params: {
          partName,
          innerDiameterMm: inner,
          outerDiameterMm: inner + defaults.wallThicknessMm * 2,
          lengthMm: barrel?.lengthMm ?? camSleeveLength,
          rotationDegrees: 90,
          axialTravelMm: 8,
          slotWidthMm: defaults.camPinDiameterMm + defaults.camSlotClearanceMm,
          facets: defaults.facets
        }
      };
    }
  }
}

function getTargetStackOuterDiameterForAirspaceInsertDefaults(project: LensProject): number {
  const manualTarget = toPositive(project.cadDefaults.targetStackOuterDiameterMm);
  if (manualTarget > 0) return manualTarget;

  const largestGlassDiameterMm = getLargestGlassDiameter(project.stackItems);
  if (largestGlassDiameterMm > 0) {
    return Math.max(
      4,
      roundUpToIncrement(
        largestGlassDiameterMm + DEFAULT_MINIMUM_CUP_WALL_THICKNESS_MM * 2,
        DEFAULT_SHARED_STACK_ROUNDING_INCREMENT_MM
      )
    );
  }

  const spacerOuterDiameterMm = project.stackItems
    .filter((item): item is Extract<StackItem, { type: "spacer" }> => item.type === "spacer")
    .reduce((max, spacer) => Math.max(max, toPositive(spacer.outerDiameterMm)), 0);
  if (spacerOuterDiameterMm > 0) return spacerOuterDiameterMm;
  return Math.max(10, toPositive(project.cadDefaults.defaultOuterDiameterMm));
}

function buildCadSourceCandidates(project: LensProject, partType: CadPartType): CadSourceCandidate[] {
  const requiredType = needsSource[partType];
  if (!requiredType) return [];

  const baseCandidates: CadSourceCandidate[] = project.stackItems
    .filter((item) => item.type === requiredType)
    .map((item) => ({
      id: item.id,
      sourceItem: item
    }));

  if (partType !== "spacer_ring" && partType !== "iris_disk" && partType !== "diffusion_holder") {
    return baseCandidates;
  }

  const targetStackOuterDiameterMm = getTargetStackOuterDiameterForAirspaceInsertDefaults(project);
  const spacerItems = [...project.stackItems]
    .sort((a, b) => a.positionIndex - b.positionIndex)
    .filter((item): item is Extract<StackItem, { type: "spacer" }> => item.type === "spacer");
  const virtualCandidates: CadSourceCandidate[] = [];

  spacerItems.forEach((spacer) => {
    const desiredOpticalAirGapMm =
      getSpacerDesiredOpticalAirGapMm(spacer) > 0
        ? getSpacerDesiredOpticalAirGapMm(spacer)
        : toPositive(spacer.thicknessMm);
    const layouts = calculateAirspaceInsertLayouts(desiredOpticalAirGapMm, spacer.insertedItems, {
      targetStackOuterDiameterMm
    });

    layouts.forEach((layout) => {
      const insert = layout.item;
      const fallbackDiskDiameterMm =
        toPositive(insert.diskDiameterMm) > 0
          ? (insert.diskDiameterMm as number)
          : toPositive(spacer.outerDiameterMm) > 0
            ? (spacer.outerDiameterMm as number)
            : targetStackOuterDiameterMm;

      if (partType === "spacer_ring") {
        const baseSpacer = {
          ...spacer,
          insertedItems: [],
          insertedItemsTotalThicknessMm: 0,
          physicalSpacerThicknessSource: "same_as_airspace" as const
        };

        if (layout.spacerBeforeMm > 0) {
          virtualCandidates.push({
            id: `${spacer.id}::${insert.id}::before`,
            sourceItem: {
              ...baseSpacer,
              id: `${spacer.id}::${insert.id}::before`,
              name: `${spacer.name} · ${insert.label} · spacer before`,
              thicknessMm: Number(layout.spacerBeforeMm.toFixed(3)),
              desiredOpticalAirGapMm: Number(layout.spacerBeforeMm.toFixed(3)),
              physicalSpacerThicknessMm: Number(layout.spacerBeforeMm.toFixed(3))
            }
          });
        }
        if (layout.spacerAfterMm > 0) {
          virtualCandidates.push({
            id: `${spacer.id}::${insert.id}::after`,
            sourceItem: {
              ...baseSpacer,
              id: `${spacer.id}::${insert.id}::after`,
              name: `${spacer.name} · ${insert.label} · spacer after`,
              thicknessMm: Number(layout.spacerAfterMm.toFixed(3)),
              desiredOpticalAirGapMm: Number(layout.spacerAfterMm.toFixed(3)),
              physicalSpacerThicknessMm: Number(layout.spacerAfterMm.toFixed(3))
            }
          });
        }
      }

      if (partType === "iris_disk" && (insert.type === "iris" || insert.type === "filter" || insert.type === "custom")) {
        virtualCandidates.push({
          id: `${spacer.id}::${insert.id}::disk`,
          sourceItem: {
            id: `${spacer.id}::${insert.id}::disk`,
            type: "iris",
            name: `${insert.label} · in ${spacer.name}`,
            positionIndex: spacer.positionIndex,
            diskDiameterMm: Number(Math.max(0.1, fallbackDiskDiameterMm).toFixed(3)),
            apertureDiameterMm: Number(
              Math.max(0.1, toPositive(insert.apertureDiameterMm) || 14).toFixed(3)
            ),
            thicknessMm: Number(Math.max(0.1, toPositive(insert.thicknessMm)).toFixed(3)),
            isOval: false
          }
        });
      }

      if (partType === "diffusion_holder" && insert.type === "diffusion") {
        const diskDiameterMm = Number(Math.max(0.1, fallbackDiskDiameterMm).toFixed(3));
        virtualCandidates.push({
          id: `${spacer.id}::${insert.id}::diff`,
          sourceItem: {
            id: `${spacer.id}::${insert.id}::diff`,
            type: "diffusion",
            name: `${insert.label} · in ${spacer.name}`,
            positionIndex: spacer.positionIndex,
            diskDiameterMm,
            clearCenterDiameterMm: Number(
              Math.max(0.1, toPositive(insert.apertureDiameterMm) || 12).toFixed(3)
            ),
            diffusionOuterDiameterMm: Number(Math.max(0.1, diskDiameterMm - 1.2).toFixed(3)),
            thicknessMm: Number(Math.max(0.1, toPositive(insert.thicknessMm)).toFixed(3))
          }
        });
      }
    });
  });

  if (partType === "spacer_ring" && virtualCandidates.length > 0) {
    return [...virtualCandidates, ...baseCandidates];
  }
  return [...baseCandidates, ...virtualCandidates];
}

export function CadGeneratorPanel({ project }: { project: LensProject }) {
  const [partType, setPartType] = useState<CadPartType>("element_cup");
  const [sourceItemId, setSourceItemId] = useState<string | undefined>();
  const [exportMode, setExportMode] = useState<"openscad" | "freecad_macro">("openscad");
  const [slidingCarrierLengthSource, setSlidingCarrierLengthSource] =
    useState<SlidingCarrierLengthSource>("lens_cup_or_stack");
  const [slidingCarrierManualLengthMm, setSlidingCarrierManualLengthMm] = useState<number>(48.0);
  const [fixedPlBarrelAttachZMm, setFixedPlBarrelAttachZMm] = useState<number>(
    project.cadDefaults.plBarrelAttachZMm ?? 0.0
  );
  const [fixedPlOverlapMm, setFixedPlOverlapMm] = useState<number>(
    Math.max(2.0, project.cadDefaults.plReferenceOverlapMm ?? 2.0)
  );
  const [guidePinOverrides, setGuidePinOverrides] = useState<GuidePinOverrides>({});
  const [builtAllPartsPackage, setBuiltAllPartsPackage] = useState<BuiltAllPartsPackage | null>(null);
  const plAssemblyIncludeMain = project.cadDefaults.plAssemblyIncludeMainBarrelSection ?? true;
  const plAssemblyIncludeCarrier = project.cadDefaults.plAssemblyIncludeMovingCarrier ?? true;
  const plAssemblyIncludePins = project.cadDefaults.plAssemblyIncludeGuidePins ?? true;
  const plAssemblyFuse = project.cadDefaults.plAssemblyFuseBarrelToPl ?? false;
  const plStepReferencePath = resolvePlStepPath(project.cadDefaults.plStepReferencePath);
  const focusDerived = getFocusTravelDerived(project);

  const sourceCandidates = useMemo(() => {
    return buildCadSourceCandidates(project, partType);
  }, [partType, project]);

  useEffect(() => {
    if (!sourceCandidates.length) {
      setSourceItemId(undefined);
      return;
    }
    setSourceItemId((current) =>
      current && sourceCandidates.some((candidate) => candidate.id === current)
        ? current
        : sourceCandidates[0].id
    );
  }, [sourceCandidates]);

  useEffect(() => {
    setFixedPlBarrelAttachZMm(project.cadDefaults.plBarrelAttachZMm ?? 0.0);
    setFixedPlOverlapMm(Math.max(2.0, project.cadDefaults.plReferenceOverlapMm ?? 2.0));
  }, [project.cadDefaults.plBarrelAttachZMm, project.cadDefaults.plReferenceOverlapMm]);

  const selectedSourceCandidate = sourceCandidates.find((candidate) => candidate.id === sourceItemId);
  const sourceItem = selectedSourceCandidate?.sourceItem;
  const setGuidePinOverride = <K extends keyof GuidePinOverrides>(key: K, value: GuidePinOverrides[K]) => {
    setGuidePinOverrides((current) => ({
      ...current,
      [key]: value
    }));
  };
  const slidingCarrierOverrides: SlidingCarrierOverrides = {
    lengthSource: slidingCarrierLengthSource,
    manualLengthMm: slidingCarrierManualLengthMm
  };
  const cascadeSizing = deriveCascadeSizing({
    project,
    defaults: project.cadDefaults,
    focusDerived,
    slidingCarrierOverrides
  });
  const guidePinSizing = deriveGuidePinSizing(project.cadDefaults, cascadeSizing);
  const guidePinResolved: GuidePinResolved = {
    pinShaftDiameterMm: Number(
      Math.max(0.5, guidePinOverrides.pinShaftDiameterMm ?? guidePinSizing.autoPinShaftDiameterMm).toFixed(3)
    ),
    pinShaftLengthMm: Number(
      Math.max(
        1.0,
        guidePinOverrides.pinShaftLengthMm ??
          Math.max(DEFAULT_GUIDE_PIN_SHAFT_LENGTH_MM, guidePinSizing.minimumRecommendedShaftLengthMm)
      ).toFixed(3)
    ),
    pinHeadDiameterMm: Number(
      Math.max(
        (guidePinOverrides.pinShaftDiameterMm ?? guidePinSizing.autoPinShaftDiameterMm) + 0.8,
        guidePinOverrides.pinHeadDiameterMm ?? DEFAULT_GUIDE_PIN_HEAD_DIAMETER_MM
      ).toFixed(3)
    ),
    pinHeadThicknessMm: Number(
      Math.max(0.4, guidePinOverrides.pinHeadThicknessMm ?? DEFAULT_GUIDE_PIN_HEAD_THICKNESS_MM).toFixed(3)
    ),
    tipChamferMm: Number(
      Math.max(0, guidePinOverrides.tipChamferMm ?? DEFAULT_GUIDE_PIN_TIP_CHAMFER_MM).toFixed(3)
    ),
    quantity: Math.max(1, Math.round(guidePinOverrides.quantity ?? DEFAULT_GUIDE_PIN_QUANTITY))
  };
  const fixedPlOverrides =
    partType === "fixed_pl_barrel_with_slots"
      ? {
          barrelAttachZMm: fixedPlBarrelAttachZMm,
          plOverlapMm: fixedPlOverlapMm
        }
      : undefined;
  const payload = createPayload(
    project,
    partType,
    sourceItem,
    fixedPlOverrides,
    slidingCarrierOverrides,
    cascadeSizing,
    guidePinOverrides
  );
  const slidingCarrierPayloadForAssembly = createPayload(
    project,
    "sliding_optical_carrier",
    sourceItem,
    undefined,
    slidingCarrierOverrides,
    cascadeSizing
  );
  const slidingCarrierParamsForAssembly =
    slidingCarrierPayloadForAssembly.type === "sliding_optical_carrier"
      ? slidingCarrierPayloadForAssembly.params
      : undefined;
  const freecadPayload: FreecadPayload | null = (() => {
    if (payload.type === "spacer_ring") {
      return { type: "spacer_ring", params: payload.params };
    }
    if (payload.type === "element_cup") {
      return { type: "element_cup", params: payload.params };
    }
    if (payload.type === "fixed_pl_barrel_with_slots") {
      if (slidingCarrierParamsForAssembly) {
        return {
          type: "sliding_focus_assembly",
          params: {
            partName: `${payload.params.partName}_pl_assembly`,
            plStepReferencePath: plStepReferencePath,
            fixedBarrel: payload.params,
            slidingCarrier: slidingCarrierParamsForAssembly,
            includeMainBarrelSection: plAssemblyIncludeMain,
            includeSlidingCarrier: plAssemblyIncludeCarrier,
            includeGuidePins: plAssemblyIncludePins,
            guidePinDiameterMm: payload.params.pinDiameterMm,
            guidePinLengthMm: Math.max(payload.params.slotWidthMm * 4, 8),
            fuseBarrelToPl: plAssemblyFuse,
            focusPrototypeStartMm: focusDerived.prototypeStartMm,
            recommendedPrototypeTravelMm: focusDerived.recommendedPrototypeTravelMm,
            targetMountThroatDiameterMm: focusDerived.targetMountThroatDiameterMm
          }
        };
      }
      return { type: "fixed_pl_barrel_with_slots", params: payload.params };
    }
    if (payload.type === "sliding_optical_carrier") {
      return { type: "sliding_optical_carrier", params: payload.params };
    }
    return null;
  })();
  const code =
    exportMode === "freecad_macro"
      ? freecadPayload
        ? generateFreecadMacro(freecadPayload)
        : "# FreeCAD macro export is available for element cups, spacer rings, fixed PL barrel with slots, and sliding optical carrier."
      : payload.type === "fixed_pl_barrel_with_slots"
        ? generateFixedPlBarrelWithSlotsPushPullV4Scad(payload.params)
        : generateScad(payload);
  const fixedPlClearanceValidationWarning =
    payload.type === "fixed_pl_barrel_with_slots" &&
    Number.isFinite(project.cadDefaults.plClearanceOuterDiameterMm ?? Number.NaN) &&
    (project.cadDefaults.plClearanceOuterDiameterMm as number) <= payload.params.mainBarrelInnerDiameterMm
      ? "PL clearance outer diameter must be larger than barrel inner diameter."
      : null;
  const fixedPlMainBarrelLengthWarning = (() => {
    if (payload.type !== "fixed_pl_barrel_with_slots") return null;
    const slotStartFromMain = payload.params.slotStartFromMainBarrelMm ?? 8.0;
    const minimumUsefulLength = slotStartFromMain + payload.params.slotLengthMm + 6;
    return payload.params.mainBarrelLengthMm < minimumUsefulLength
      ? "Main barrel may be too short for the axial slot travel. Increase barrel length or reduce slot length."
      : null;
  })();
  const fixedPlConnectorDiscWarning = (() => {
    if (payload.type !== "fixed_pl_barrel_with_slots") return null;
    const connectorEnabled = payload.params.connectorDiscEnabled ?? true;
    const plInterfaceOuterDiameter = payload.params.plInterfaceOuterDiameterMm ?? 54.9;
    return !connectorEnabled && payload.params.mainBarrelOuterDiameterMm < plInterfaceOuterDiameter
      ? "Main barrel OD is smaller than PL interface OD and may not connect to the PL mount. Enable connector disc."
      : null;
  })();
  const fixedPlConnectorDiscThicknessWarning = (() => {
    if (payload.type !== "fixed_pl_barrel_with_slots") return null;
    if (!(payload.params.connectorDiscEnabled ?? true)) return null;
    const thickness = payload.params.connectorDiscThicknessMm ?? 0.8;
    if (thickness > 1.5) {
      return "Connector disc is quite thick and may look like a raised flange. For a thin adapter plate use 0.8-1.2mm.";
    }
    if (thickness < 0.6) {
      return "Connector disc may be too thin for FDM printing.";
    }
    return null;
  })();
  const slidingCarrierValidationWarnings = (() => {
    if (payload.type !== "sliding_optical_carrier") return [] as string[];
    const fixedBarrelInnerDiameter = cascadeSizing.fixedBarrelInnerDiameterMm;
    const warnings: string[] = [];
    if (payload.params.addPinBosses) {
      warnings.push("External pin bosses may prevent the carrier from sliding inside the fixed barrel.");
    }
    if (payload.params.outerDiameterMm >= fixedBarrelInnerDiameter) {
      warnings.push(
        "Carrier outer diameter must be smaller than fixed barrel inner diameter. Recommended clearance: carrier_outer_diameter = fixed_barrel_inner_diameter - 0.6mm to 1.0mm."
      );
    }
    const carrierClearance = fixedBarrelInnerDiameter - payload.params.outerDiameterMm;
    if (carrierClearance > 0 && (carrierClearance < 0.6 || carrierClearance > 1.0)) {
      warnings.push(
        "Recommended carrier-to-barrel clearance is 0.6mm to 1.0mm (carrier_outer_diameter = fixed_barrel_inner_diameter - 0.6mm to 1.0mm)."
      );
    }
    const wallThickness = (payload.params.outerDiameterMm - payload.params.innerDiameterMm) / 2;
    if (wallThickness < 1.5) {
      warnings.push("Carrier wall may be too thin.");
    }
    const retainingLipEnabled = payload.params.retainingLipEnabled ?? true;
    if (retainingLipEnabled) {
      const opticalClearApertureMm = toPositive(payload.params.opticalClearApertureMm);
      const retainingLipThicknessMm = payload.params.retainingLipThicknessMm ?? 1.2;
      const retainingLipInnerDiameterMm =
        payload.params.retainingLipInnerDiameterMm ??
        Math.max(30.0, opticalClearApertureMm > 0 ? opticalClearApertureMm + 2.0 : 30.0);
      if (retainingLipThicknessMm < 0.8) {
        warnings.push("Retaining lip may be too thin.");
      }
      if (retainingLipInnerDiameterMm >= payload.params.innerDiameterMm) {
        warnings.push("Retaining lip inner diameter is too large; no retaining lip remains.");
      }
      if (opticalClearApertureMm > 0 && retainingLipInnerDiameterMm <= opticalClearApertureMm) {
        warnings.push("Retaining lip inner diameter should be larger than optical clear aperture.");
      }
      const vignettingThresholdMm = opticalClearApertureMm > 0 ? opticalClearApertureMm + 1.0 : 24.0;
      if (retainingLipInnerDiameterMm < vignettingThresholdMm) {
        warnings.push("Retaining lip may vignette the optical path.");
      }
    }
    return warnings;
  })();
  const guidePinValidationWarnings = (() => {
    if (payload.type !== "guide_pin") return [] as string[];
    const warnings: string[] = [];
    const slotWidthMm = toPositive(payload.params.slotWidthMm);
    const carrierPinHoleDiameterMm = toPositive(payload.params.carrierPinHoleDiameterMm);
    const fixedBarrelWallThicknessMm = toPositive(payload.params.fixedBarrelWallThicknessMm);
    const carrierWallThicknessMm = toPositive(payload.params.carrierWallThicknessMm);
    const requiredEngagementLengthMm = fixedBarrelWallThicknessMm + carrierWallThicknessMm;

    if (slotWidthMm > 0 && payload.params.pinShaftDiameterMm >= slotWidthMm) {
      warnings.push("Pin is too thick for fixed barrel slot.");
    }
    if (carrierPinHoleDiameterMm > 0 && payload.params.pinShaftDiameterMm >= carrierPinHoleDiameterMm) {
      warnings.push("Pin is too thick for carrier pin hole.");
    }
    if (requiredEngagementLengthMm > 0 && payload.params.pinShaftLengthMm < requiredEngagementLengthMm) {
      warnings.push("Pin may be too short to engage the carrier.");
    }
    return warnings;
  })();
  const elementCupValidationWarnings = (() => {
    if (payload.type !== "element_cup") return [] as string[];
    const warnings: string[] = [];
    const cupWallThicknessMm = ((payload.params.outerDiameterMm ?? 0) - payload.params.glassDiameterMm) / 2;
    if (cupWallThicknessMm < 1.5) {
      warnings.push("Lens cup wall may be too thin.");
    }
    if (
      toPositive(payload.params.outerDiameterMm) > 0 &&
      Math.abs(toPositive(payload.params.outerDiameterMm) - cascadeSizing.targetStackOuterDiameterMm) > 0.01
    ) {
      warnings.push("Cup OD does not match target stack outer diameter.");
    }

    const retainingLipEnabled = payload.params.retainingLipEnabled ?? true;
    const retainingLipInnerDiameterMm = toPositive(payload.params.retainingLipInnerDiameterMm);
    if (retainingLipEnabled && retainingLipInnerDiameterMm > 0) {
      const maxPracticalInner = toPositive(payload.params.glassDiameterMm + payload.params.seatClearanceMm);
      if (retainingLipInnerDiameterMm >= maxPracticalInner) {
        warnings.push("Retaining lip inner diameter is too large; no retaining lip remains.");
      }
      const sourceGlass = sourceItem?.type === "glass" ? sourceItem : cascadeSizing.sourceGlass;
      const opticalClearAperture = toPositive(sourceGlass?.clearApertureMm);
      if (opticalClearAperture > 0 && retainingLipInnerDiameterMm <= opticalClearAperture) {
        warnings.push("Retaining lip inner diameter should be larger than clear aperture.");
      }
      if (opticalClearAperture > 0 && retainingLipInnerDiameterMm < opticalClearAperture + 1.0) {
        warnings.push("Retaining lip inner diameter may vignette.");
      }
    }

    if (payload.params.advancedProfile?.enabled) {
      const advanced = payload.params.advancedProfile;
      const sortedSections = (advanced.sections ?? [])
        .slice()
        .sort((a, b) => a.index - b.index)
        .filter((section) => section.diameterMm > 0 && section.lengthMm > 0);
      if (!sortedSections.length) return warnings;
      const insertionSide = payload.params.resolvedCupInsertionSide ?? "front";
      const traversal = insertionSide === "rear" ? sortedSections.slice().reverse() : sortedSections;
      let maxSectionTraversalIndex = 0;
      let smallestDelta = Number.POSITIVE_INFINITY;
      traversal.forEach((section, index) => {
        const delta = Math.abs(section.diameterMm - advanced.maxDiameterMm);
        if (delta < smallestDelta) {
          smallestDelta = delta;
          maxSectionTraversalIndex = index;
        }
      });
      const hasPreMaxSmallerSection = traversal.some(
        (section, index) => index < maxSectionTraversalIndex && section.diameterMm < advanced.maxDiameterMm - 0.001
      );
      if (hasPreMaxSmallerSection) {
        warnings.push("Max diameter occurs after a smaller section. Bore before max diameter was enlarged for insertion.");
        if (insertionSide === "front") {
          warnings.push("Consider loading this cup from the rear/max-diameter side.");
        }
      }
      const lastMeasuredDiameter = traversal[traversal.length - 1]?.diameterMm ?? advanced.maxDiameterMm;
      const defaultRearClearHole = Math.max(lastMeasuredDiameter - 2.0, 0.4);
      const requestedRearClearHole = Math.max(advanced.rearClearHoleMm ?? defaultRearClearHole, 0.4);
      const insertionSafeBoreSections = buildInsertionSafeBoreSections(
        advanced,
        payload.params.seatClearanceMm,
        insertionSide
      );
      const lastBoreDiameter =
        insertionSafeBoreSections[insertionSafeBoreSections.length - 1]?.diameterMm ??
        advanced.maxDiameterMm + payload.params.seatClearanceMm;
      if (requestedRearClearHole >= lastBoreDiameter) {
        warnings.push("Rear clear hole is too large; no retaining lip remains.");
      }
      if (payload.params.rearLipMm < 0.8) {
        warnings.push("Rear retaining lip may be too thin.");
      }
      if (!insertionSafeBoreSections.length) {
        warnings.push("Cup bore is not insertion-safe from selected insertion side.");
      }
      if (
        payload.params.cupRetainingSide &&
        payload.params.cupRetainingSide !== "auto" &&
        payload.params.cupRetainingSide !== payload.params.resolvedCupRetainingSide
      ) {
        warnings.push("Requested retaining side is not fully supported by current cup generator; using insertion-safe fallback.");
      }
    }
    return warnings;
  })();
  const spacerValidationWarnings = (() => {
    if (payload.type !== "spacer_ring") return [] as string[];
    const warnings: string[] = [];
    const desiredOpticalAirGapMm = toPositive(payload.params.desiredOpticalAirGapMm) || toPositive(payload.params.thicknessMm);
    const printedSpacerThicknessMm =
      typeof payload.params.physicalSpacerThicknessMm === "number"
        ? payload.params.physicalSpacerThicknessMm
        : payload.params.thicknessMm;
    const source = payload.params.spacerThicknessSource ?? payload.params.physicalSpacerThicknessSource ?? "same_as_airspace";
    const previousCupRearOffsetMm = payload.params.previousCupRearOffsetMm ?? 0;
    const nextCupFrontOffsetMm = payload.params.nextCupFrontOffsetMm ?? 0;
    const calculatedPhysicalSpacerThicknessMm =
      payload.params.calculatedPhysicalSpacerThicknessMm ?? printedSpacerThicknessMm;

    if (Math.abs(payload.params.outerDiameterMm - cascadeSizing.targetStackOuterDiameterMm) > 0.01) {
      warnings.push("Spacer OD does not match target stack outer diameter.");
    }
    if (payload.params.outerDiameterMm <= payload.params.innerDiameterMm) {
      warnings.push("Spacer OD must be larger than spacer ID.");
    }
    if (printedSpacerThicknessMm < 0) {
      warnings.push("Printed spacer thickness is negative.");
    }
    if (source === "calculated_from_cup_offsets" && previousCupRearOffsetMm === 0 && nextCupFrontOffsetMm === 0) {
      warnings.push("Cup offset compensation unavailable; printed spacer equals measured airspace.");
    }
    if (calculatedPhysicalSpacerThicknessMm < 0) {
      warnings.push("Cup lips/offsets exceed desired optical air gap. Reduce lip thickness or change cup design.");
    }
    if (desiredOpticalAirGapMm > 0) {
      const diff = Math.abs(printedSpacerThicknessMm - desiredOpticalAirGapMm);
      if (diff > 0.2) {
        warnings.push("Spacer thickness was adjusted to compensate for cup retaining lips.");
      } else if (diff > 0.001) {
        warnings.push("Desired optical airspace differs from printed spacer thickness.");
      }
    }
    return warnings;
  })();
  const autoFitSystemWarnings = (() => {
    const warnings: string[] = [];
    const targetStackOuterDiameterMm = toPositive(cascadeSizing.targetStackOuterDiameterMm);
    const toleranceMm = 0.01;
    const glasses = project.stackItems.filter(
      (item): item is Extract<StackItem, { type: "glass" }> => item.type === "glass"
    );
    const spacers = project.stackItems.filter(
      (item): item is Extract<StackItem, { type: "spacer" }> => item.type === "spacer"
    );

    const lensCupOuterDiameters = glasses.map((glass) => {
      const cupPayload = createPayload(
        project,
        "element_cup",
        glass,
        undefined,
        slidingCarrierOverrides,
        cascadeSizing
      );
      return cupPayload.type === "element_cup" ? toPositive(cupPayload.params.outerDiameterMm) : 0;
    });
    if (
      targetStackOuterDiameterMm > 0 &&
      lensCupOuterDiameters.some((outerDiameterMm) => Math.abs(outerDiameterMm - targetStackOuterDiameterMm) > toleranceMm)
    ) {
      warnings.push("Lens cup OD does not match shared stack OD.");
    }
    if (
      targetStackOuterDiameterMm > 0 &&
      spacers.some((spacer) => Math.abs(spacer.outerDiameterMm - targetStackOuterDiameterMm) > toleranceMm)
    ) {
      warnings.push("Spacer OD does not match shared stack OD.");
    }
    if (cascadeSizing.carrierInnerDiameterMm <= targetStackOuterDiameterMm) {
      warnings.push("Optical carrier ID is too small for lenscup/spacer stack.");
    }
    if (cascadeSizing.fixedBarrelInnerDiameterMm <= cascadeSizing.carrierOuterDiameterMm) {
      warnings.push("Fixed PL barrel ID is too small for optical carrier.");
    }
    if (spacers.some((spacer) => spacer.outerDiameterMm <= spacer.innerDiameterMm)) {
      warnings.push("Spacer OD must be larger than spacer ID.");
    }
    if (
      targetStackOuterDiameterMm > 0 &&
      glasses.some((glass) => {
        const localMaxDiameterMm = getMeasuredGlassMaxDiameterMm(glass);
        if (localMaxDiameterMm <= 0) return false;
        const cupWallThicknessMm = (targetStackOuterDiameterMm - localMaxDiameterMm) / 2;
        return cupWallThicknessMm < 1.5;
      })
    ) {
      warnings.push("Lens cup wall may be too thin.");
    }
    if (
      targetStackOuterDiameterMm > 0 &&
      cascadeSizing.sourceGlassMaxDiameterMm > 0 &&
      targetStackOuterDiameterMm <
        cascadeSizing.sourceGlassMaxDiameterMm + cascadeSizing.minimumCupWallThicknessMm * 2
    ) {
      warnings.push("Target stack OD is too small for largest glass plus minimum cup wall thickness.");
    }
    if (cascadeSizing.carrierWallThicknessMm < 1.5) {
      warnings.push("Carrier wall may be too thin.");
    }
    return [...new Set(warnings)];
  })();
  const exportModeWarnings = [
    ...(exportMode === "freecad_macro" && !freecadPayload
      ? [
          "FreeCAD macro export is available for element cups, spacer rings, fixed PL barrel with slots, and sliding optical carrier."
        ]
      : []),
    ...(exportMode === "openscad" && payload.type === "fixed_pl_barrel_with_slots"
      ? [
          "OpenSCAD fixed-PL barrel can include an imported PL STL reference under the barrel.",
          "If the PL shape is missing, verify pl_reference_stl_path points to a valid local STL file.",
          "For exact STEP alignment + full assembly workflow, use FreeCAD Assembly Macro with PL STEP.",
          "Main barrel length follows slot start + slot length + end margin. With 8mm start, 32mm slot, and 6mm margin, length is 46mm."
        ]
      : []),
    ...(fixedPlClearanceValidationWarning ? [fixedPlClearanceValidationWarning] : []),
    ...(fixedPlMainBarrelLengthWarning ? [fixedPlMainBarrelLengthWarning] : []),
    ...(fixedPlConnectorDiscWarning ? [fixedPlConnectorDiscWarning] : []),
    ...(fixedPlConnectorDiscThicknessWarning ? [fixedPlConnectorDiscThicknessWarning] : [])
  ];
  const partWarnings = [...new Set([
    ...(sourceItem ? getPartWarnings(sourceItem, project.cadDefaults) : []),
    ...autoFitSystemWarnings,
    ...elementCupValidationWarnings,
    ...spacerValidationWarnings,
    ...slidingCarrierValidationWarnings,
    ...guidePinValidationWarnings
  ])];
  const buildAllPartsPackage = () => {
    const warnings: string[] = [];
    const errors: string[] = [];
    const orderedStackItems = [...project.stackItems].sort((a, b) => a.positionIndex - b.positionIndex);
    const generatedPartLabels: string[] = [];
    const smallParts: PackageSmallPart[] = [];

    const pushWarning = (line: string) => {
      if (line.trim()) warnings.push(line.trim());
    };
    const pushError = (line: string) => {
      if (line.trim()) errors.push(line.trim());
    };

    if (orderedStackItems.length === 0) {
      pushError("No stack items found. Add stack items before building a package.");
    }

    const glassItems = orderedStackItems.filter(
      (item): item is Extract<StackItem, { type: "glass" }> => item.type === "glass"
    );
    if (glassItems.length === 0) {
      pushError("No glass items found. At least one glass element/group is required.");
    }

    getStackWarnings(orderedStackItems, project.cadDefaults).forEach(pushWarning);
    autoFitSystemWarnings.forEach(pushWarning);
    if (!focusDerived.recommendedPrototypeTravelMm || focusDerived.recommendedPrototypeTravelMm <= 0) {
      pushWarning("Focus travel recommendation unavailable.");
    }
    if (!focusDerived.targetMountThroatDiameterMm || focusDerived.targetMountThroatDiameterMm <= 0) {
      pushWarning("PL throat measurement is unknown. Measure actual mount throat before finalizing fit.");
    }

    const validatePayload = (entry: PackageSmallPart) => {
      const { payload, label } = entry;
      if (payload.type === "element_cup") {
        if (toPositive(payload.params.glassDiameterMm) <= 0) {
          pushError(`${label}: missing glass diameter.`);
        }
        if (toPositive(payload.params.glassThicknessMm) <= 0) {
          pushError(`${label}: non-positive glass/cup thickness.`);
        }
        if (toPositive(payload.params.outerDiameterMm) <= 0) {
          pushError(`${label}: non-positive cup outer diameter.`);
        }
      }
      if (payload.type === "spacer_ring") {
        if (toPositive(payload.params.thicknessMm) <= 0) {
          pushError(`${label}: spacer thickness is non-positive.`);
        }
        if (toPositive(payload.params.outerDiameterMm) <= toPositive(payload.params.innerDiameterMm)) {
          pushError(`${label}: spacer OD must be larger than spacer ID.`);
        }
      }
      if (payload.type === "iris_disk") {
        if (toPositive(payload.params.thicknessMm) <= 0) {
          pushError(`${label}: insert thickness is non-positive.`);
        }
        if (toPositive(payload.params.diskDiameterMm) <= 0) {
          pushError(`${label}: insert disk diameter is missing.`);
        }
        if (toPositive(payload.params.apertureDiameterMm) <= 0) {
          pushError(`${label}: insert aperture diameter is missing.`);
        }
        if (toPositive(payload.params.apertureDiameterMm) >= toPositive(payload.params.diskDiameterMm)) {
          pushError(`${label}: aperture must be smaller than disk diameter.`);
        }
      }
      if (payload.type === "diffusion_holder") {
        if (toPositive(payload.params.holderThicknessMm) <= 0) {
          pushError(`${label}: diffusion holder thickness is non-positive.`);
        }
        if (toPositive(payload.params.diskDiameterMm) <= 0) {
          pushError(`${label}: diffusion disk diameter is missing.`);
        }
      }
      if (payload.type === "guide_pin") {
        if (toPositive(payload.params.pinShaftDiameterMm) <= 0 || toPositive(payload.params.pinShaftLengthMm) <= 0) {
          pushError(`${label}: guide pin shaft dimensions must be positive.`);
        }
        if (toPositive(payload.params.pinHeadDiameterMm) <= 0 || toPositive(payload.params.pinHeadThicknessMm) <= 0) {
          pushError(`${label}: guide pin head dimensions must be positive.`);
        }
      }
    };

    const pushSmallPart = (label: string, payload: ScadPayload, sourceStackItemName?: string) => {
      const part: PackageSmallPart = { label, payload, sourceStackItemName };
      validatePayload(part);
      generatedPartLabels.push(label);
      smallParts.push(part);
    };

    glassItems.forEach((glass, index) => {
      const cupPayload = createPayload(
        project,
        "element_cup",
        glass,
        undefined,
        slidingCarrierOverrides,
        cascadeSizing,
        guidePinOverrides
      );
      if (cupPayload.type === "element_cup") {
        pushSmallPart(`Lens cup ${index + 1}: ${glass.name}`, cupPayload, glass.name);
      }
    });

    orderedStackItems.forEach((item, index) => {
      if (item.type !== "spacer") return;
      const desiredOpticalAirGapMm = getSpacerDesiredOpticalAirGapMm(item);
      const nearbyApertureMm = getNearbyAperture(orderedStackItems, index);
      const layouts = calculateAirspaceInsertLayouts(desiredOpticalAirGapMm, item.insertedItems, {
        targetStackOuterDiameterMm: cascadeSizing.targetStackOuterDiameterMm,
        nearbyClearApertureMm: nearbyApertureMm
      });

      if (!layouts.length) {
        const spacerPayload = createPayload(
          project,
          "spacer_ring",
          item,
          undefined,
          slidingCarrierOverrides,
          cascadeSizing,
          guidePinOverrides
        );
        if (spacerPayload.type === "spacer_ring") {
          pushSmallPart(`AirSpace spacer: ${item.name}`, spacerPayload, item.name);
        }
        return;
      }

      layouts.forEach((layout, layoutIndex) => {
        layout.warnings.forEach((warning) => pushWarning(`${layout.item.label}: ${warning}`));
        const beforeThicknessMm = Number(layout.spacerBeforeMm.toFixed(3));
        const afterThicknessMm = Number(layout.spacerAfterMm.toFixed(3));

        if (beforeThicknessMm <= 0) {
          pushError(`${layout.item.label}: spacer before insert is non-positive.`);
        } else {
          const virtualBeforeSpacer: Extract<StackItem, { type: "spacer" }> = {
            ...item,
            id: `${item.id}::${layout.item.id}::before`,
            name: `${item.name} spacer before ${layout.item.label}`,
            thicknessMm: beforeThicknessMm,
            desiredOpticalAirGapMm: beforeThicknessMm,
            physicalSpacerThicknessMm: beforeThicknessMm,
            physicalSpacerThicknessSource: "same_as_airspace",
            insertedItems: [],
            insertedItemsTotalThicknessMm: 0
          };
          const spacerBeforePayload = createPayload(
            project,
            "spacer_ring",
            virtualBeforeSpacer,
            undefined,
            slidingCarrierOverrides,
            cascadeSizing,
            guidePinOverrides
          );
          if (spacerBeforePayload.type === "spacer_ring") {
            pushSmallPart(
              `AirSpace split spacer before (${layoutIndex + 1}): ${item.name}`,
              spacerBeforePayload,
              item.name
            );
          }
        }

        const fallbackDiskDiameterMm =
          toPositive(layout.item.diskDiameterMm) > 0
            ? (layout.item.diskDiameterMm as number)
            : cascadeSizing.targetStackOuterDiameterMm;

        if (layout.item.type === "diffusion") {
          const virtualDiffusion: Extract<StackItem, { type: "diffusion" }> = {
            id: `${item.id}::${layout.item.id}::diff`,
            type: "diffusion",
            name: layout.item.label,
            positionIndex: item.positionIndex,
            opticalType: "DIFFUSION",
            diskDiameterMm: Number(Math.max(0.1, fallbackDiskDiameterMm).toFixed(3)),
            clearCenterDiameterMm: Number(
              Math.max(0.1, toPositive(layout.item.apertureDiameterMm) || 12).toFixed(3)
            ),
            diffusionOuterDiameterMm: Number(Math.max(0.1, fallbackDiskDiameterMm - 1.2).toFixed(3)),
            thicknessMm: Number(Math.max(0.1, toPositive(layout.item.thicknessMm)).toFixed(3))
          };
          const diffusionPayload = createPayload(
            project,
            "diffusion_holder",
            virtualDiffusion,
            undefined,
            slidingCarrierOverrides,
            cascadeSizing,
            guidePinOverrides
          );
          if (diffusionPayload.type === "diffusion_holder") {
            pushSmallPart(`Insert diffusion disk: ${layout.item.label}`, diffusionPayload, item.name);
          }
        } else {
          const virtualIris: Extract<StackItem, { type: "iris" }> = {
            id: `${item.id}::${layout.item.id}::disk`,
            type: "iris",
            name: layout.item.label,
            positionIndex: item.positionIndex,
            opticalType: layout.item.type === "filter" ? "FILTER" : layout.item.type === "custom" ? "EFFECT" : "IRIS",
            diskDiameterMm: Number(Math.max(0.1, fallbackDiskDiameterMm).toFixed(3)),
            apertureDiameterMm: Number(
              Math.max(0.1, toPositive(layout.item.apertureDiameterMm) || 14).toFixed(3)
            ),
            thicknessMm: Number(Math.max(0.1, toPositive(layout.item.thicknessMm)).toFixed(3)),
            isOval: false
          };
          const irisPayload = createPayload(
            project,
            "iris_disk",
            virtualIris,
            undefined,
            slidingCarrierOverrides,
            cascadeSizing,
            guidePinOverrides
          );
          if (irisPayload.type === "iris_disk") {
            pushSmallPart(`Insert ${layout.item.type} disk: ${layout.item.label}`, irisPayload, item.name);
          }
        }

        if (afterThicknessMm <= 0) {
          pushError(`${layout.item.label}: spacer after insert is non-positive.`);
        } else {
          const virtualAfterSpacer: Extract<StackItem, { type: "spacer" }> = {
            ...item,
            id: `${item.id}::${layout.item.id}::after`,
            name: `${item.name} spacer after ${layout.item.label}`,
            thicknessMm: afterThicknessMm,
            desiredOpticalAirGapMm: afterThicknessMm,
            physicalSpacerThicknessMm: afterThicknessMm,
            physicalSpacerThicknessSource: "same_as_airspace",
            insertedItems: [],
            insertedItemsTotalThicknessMm: 0
          };
          const spacerAfterPayload = createPayload(
            project,
            "spacer_ring",
            virtualAfterSpacer,
            undefined,
            slidingCarrierOverrides,
            cascadeSizing,
            guidePinOverrides
          );
          if (spacerAfterPayload.type === "spacer_ring") {
            pushSmallPart(
              `AirSpace split spacer after (${layoutIndex + 1}): ${item.name}`,
              spacerAfterPayload,
              item.name
            );
          }
        }
      });
    });

    orderedStackItems.forEach((item) => {
      if (item.type === "iris") {
        const irisPayload = createPayload(
          project,
          "iris_disk",
          item,
          undefined,
          slidingCarrierOverrides,
          cascadeSizing,
          guidePinOverrides
        );
        if (irisPayload.type === "iris_disk") {
          pushSmallPart(`Iris disk: ${item.name}`, irisPayload, item.name);
        }
      }
      if (item.type === "diffusion") {
        const diffusionPayload = createPayload(
          project,
          "diffusion_holder",
          item,
          undefined,
          slidingCarrierOverrides,
          cascadeSizing,
          guidePinOverrides
        );
        if (diffusionPayload.type === "diffusion_holder") {
          pushSmallPart(`Diffusion holder: ${item.name}`, diffusionPayload, item.name);
        }
      }
    });

    const guidePinPayload = createPayload(
      project,
      "guide_pin",
      undefined,
      undefined,
      slidingCarrierOverrides,
      cascadeSizing,
      guidePinOverrides
    );
    if (guidePinPayload.type === "guide_pin") {
      pushSmallPart("Guide pins for sliding carrier", guidePinPayload);
    }

    const slidingCarrierPayload = createPayload(
      project,
      "sliding_optical_carrier",
      cascadeSizing.sourceGlass,
      undefined,
      slidingCarrierOverrides,
      cascadeSizing,
      guidePinOverrides
    );
    const fixedBarrelPayload = createPayload(
      project,
      "fixed_pl_barrel_with_slots",
      undefined,
      {
        barrelAttachZMm: fixedPlBarrelAttachZMm,
        plOverlapMm: fixedPlOverlapMm
      },
      slidingCarrierOverrides,
      cascadeSizing,
      guidePinOverrides
    );

    if (slidingCarrierPayload.type !== "sliding_optical_carrier") {
      pushError("Failed to generate sliding optical carrier payload.");
    } else if (
      toPositive(slidingCarrierPayload.params.lengthMm) <= 0 ||
      toPositive(slidingCarrierPayload.params.outerDiameterMm) <= toPositive(slidingCarrierPayload.params.innerDiameterMm)
    ) {
      pushError("Sliding optical carrier geometry is invalid (check ID/OD/length).");
    }

    if (fixedBarrelPayload.type !== "fixed_pl_barrel_with_slots") {
      pushError("Failed to generate fixed PL barrel payload.");
    } else if (
      toPositive(fixedBarrelPayload.params.mainBarrelLengthMm) <= 0 ||
      toPositive(fixedBarrelPayload.params.mainBarrelOuterDiameterMm) <=
        toPositive(fixedBarrelPayload.params.mainBarrelInnerDiameterMm)
    ) {
      pushError("Fixed PL barrel geometry is invalid (check ID/OD/length).");
    }

    const stackSummaryLines = orderedStackItems.flatMap((item, index) => {
      if (item.type === "glass") {
        return [
          `${index + 1}. ${item.name} — glass Ø${pretty(item.diameterMm)}mm × ${pretty(item.thicknessMm)}mm`
        ];
      }
      if (item.type === "spacer") {
        const desired = getSpacerDesiredOpticalAirGapMm(item);
        const printed = getSpacerPrintedThicknessMm(item);
        const layouts = calculateAirspaceInsertLayouts(desired, item.insertedItems, {
          targetStackOuterDiameterMm: cascadeSizing.targetStackOuterDiameterMm,
          nearbyClearApertureMm: getNearbyAperture(orderedStackItems, index)
        });
        if (!layouts.length) {
          return [
            `${index + 1}. ${item.name} — desired airspace ${pretty(desired)}mm, printed spacer ${pretty(printed)}mm`
          ];
        }
        const base = `${index + 1}. ${item.name} — desired airspace ${pretty(desired)}mm`;
        const inserts = layouts.map((layout) =>
          `   - Insert ${layout.item.type} (${layout.item.label}) ${pretty(layout.item.thicknessMm)}mm, spacer before ${pretty(layout.spacerBeforeMm)}mm, spacer after ${pretty(layout.spacerAfterMm)}mm`
        );
        return [base, ...inserts];
      }
      if (item.type === "iris") {
        return [`${index + 1}. ${item.name} — standalone iris ${pretty(item.thicknessMm)}mm`];
      }
      if (item.type === "diffusion") {
        return [`${index + 1}. ${item.name} — standalone diffusion ${pretty(item.thicknessMm)}mm`];
      }
      return [`${index + 1}. ${item.name} — ${item.type}`];
    });

    const smallPartsScad = buildSmallPartsPlateScad(smallParts);
    const slidingCarrierScad =
      slidingCarrierPayload.type === "sliding_optical_carrier"
        ? generateScad(slidingCarrierPayload)
        : "// Sliding optical carrier generation failed.";
    const fixedPlBarrelScad =
      fixedBarrelPayload.type === "fixed_pl_barrel_with_slots"
        ? generateFixedPlBarrelWithSlotsPushPullV4Scad(fixedBarrelPayload.params)
        : "// Fixed PL barrel generation failed.";

    const dedupWarnings = [...new Set(warnings)];
    const dedupErrors = [...new Set(errors)];
    const builtAtIso = new Date().toISOString();
    const summaryText = `Timo Sasaki Lens Lab Prototype Package

Project: ${project.name}
Generated: ${builtAtIso}

Auto-fit System:
- largest_glass_diameter: ${pretty(cascadeSizing.sourceGlassMaxDiameterMm)} mm
- target_stack_outer_diameter: ${pretty(cascadeSizing.targetStackOuterDiameterMm)} mm
- optical_stack_length: ${pretty(cascadeSizing.opticalStackLengthMm)} mm
- carrier_inner_diameter: ${pretty(cascadeSizing.carrierInnerDiameterMm)} mm
- carrier_outer_diameter: ${pretty(cascadeSizing.carrierOuterDiameterMm)} mm
- fixed_barrel_inner_diameter: ${pretty(cascadeSizing.fixedBarrelInnerDiameterMm)} mm
- fixed_barrel_outer_diameter: ${pretty(cascadeSizing.fixedBarrelOuterDiameterMm)} mm
- fixed_barrel_length: ${pretty(cascadeSizing.mainBarrelLengthMm)} mm
- slot_length: ${pretty(cascadeSizing.slotLengthMm)} mm
- recommended_focus_travel: ${focusDerived.recommendedPrototypeTravelMm ? `${pretty(focusDerived.recommendedPrototypeTravelMm)} mm` : "not available"}
- recommended_slot_length: ${focusDerived.recommendedSlotLengthMm ? `${pretty(focusDerived.recommendedSlotLengthMm)} mm` : "not available"}

Stack Order (front -> sensor):
${stackSummaryLines.join("\n")}

Generated files:
- all_small_parts_plate.scad
- sliding_optical_carrier.scad
- fixed_pl_barrel.scad
- prototype_summary.txt

Generated parts on small parts plate:
${generatedPartLabels.map((label) => `- ${label}`).join("\n")}

Print notes:
- Small parts plate: print flat as generated, supports off.
- Sliding optical carrier: print upright, supports off, clean pin holes after print.
- Fixed PL barrel: print PL/flange side on bed if possible, supports off, inspect slot edges.
- Guide pins: print flat as generated, then test-fit through slot and carrier hole.

Warnings:
${dedupWarnings.length ? dedupWarnings.map((line) => `- ${line}`).join("\n") : "- none"}

Blocking errors:
${dedupErrors.length ? dedupErrors.map((line) => `- ${line}`).join("\n") : "- none"}
`;

    setBuiltAllPartsPackage({
      builtAtIso,
      smallPartsScad,
      slidingCarrierScad,
      fixedPlBarrelScad,
      summaryText,
      generatedPartLabels,
      warnings: dedupWarnings,
      errors: dedupErrors
    });
  };
  const autoFitSystemSpecs = useMemo(() => {
    return {
      largest_glass_diameter: `${pretty(cascadeSizing.sourceGlassMaxDiameterMm)} mm`,
      minimum_cup_wall_thickness: `${pretty(cascadeSizing.minimumCupWallThicknessMm)} mm`,
      target_stack_outer_diameter: `${pretty(cascadeSizing.targetStackOuterDiameterMm)} mm`,
      optical_stack_length: `${pretty(cascadeSizing.opticalStackLengthMm)} mm`,
      carrier_inner_diameter: `${pretty(cascadeSizing.carrierInnerDiameterMm)} mm`,
      carrier_outer_diameter: `${pretty(cascadeSizing.carrierOuterDiameterMm)} mm`,
      fixed_barrel_inner_diameter: `${pretty(cascadeSizing.fixedBarrelInnerDiameterMm)} mm`,
      fixed_barrel_outer_diameter: `${pretty(cascadeSizing.fixedBarrelOuterDiameterMm)} mm`,
      fixed_barrel_length: `${pretty(cascadeSizing.mainBarrelLengthMm)} mm`,
      lenscup_od: `${pretty(cascadeSizing.targetStackOuterDiameterMm)} mm`,
      spacer_od: `${pretty(cascadeSizing.targetStackOuterDiameterMm)} mm`
    };
  }, [cascadeSizing]);

  const specs = useMemo(() => {
    const values: Record<string, string | number | boolean> = {
      part_name: payload.params.partName
    };

    if (payload.type === "element_cup") {
      values.largest_glass_diameter = `${pretty(cascadeSizing.sourceGlassMaxDiameterMm)} mm`;
      values.carrier_inner_diameter = `${pretty(cascadeSizing.carrierInnerDiameterMm)} mm`;
      values.cup_to_carrier_clearance = `${pretty(cascadeSizing.cupToCarrierClearanceMm)} mm`;
      values.target_stack_outer_diameter = `${pretty(cascadeSizing.targetStackOuterDiameterMm)} mm`;
      values.target_stack_outer_diameter_source = cascadeSizing.targetStackOuterDiameterSource;
      values.lens_cup_outer_diameter = `${pretty(payload.params.outerDiameterMm ?? 0)} mm`;
      values.spacer_outer_diameter = `${pretty(cascadeSizing.targetStackOuterDiameterMm)} mm`;
      values.source_glass_max_diameter = `${pretty(cascadeSizing.sourceGlassMaxDiameterMm)} mm`;
      values.glass_diameter = `${pretty(payload.params.glassDiameterMm)} mm`;
      values.glass_thickness = `${pretty(payload.params.glassThicknessMm)} mm`;
      values.seat_clearance = `${pretty(payload.params.seatClearanceMm)} mm`;
      values.wall_thickness = `${pretty(payload.params.wallThicknessMm)} mm`;
      values.outer_diameter = `${pretty(payload.params.outerDiameterMm ?? 0)} mm`;
      values.cup_depth = `${pretty(payload.params.cupDepthMm ?? cascadeSizing.cupDepthMm ?? 0)} mm`;
      values.cup_outer_diameter = `${pretty(payload.params.outerDiameterMm ?? cascadeSizing.cupOuterDiameterMm ?? 0)} mm`;
      values.cup_insertion_side_requested = payload.params.cupInsertionSide ?? "auto";
      values.cup_insertion_side_resolved = payload.params.resolvedCupInsertionSide ?? "front";
      values.cup_retaining_side_requested = payload.params.cupRetainingSide ?? "auto";
      values.cup_retaining_side_resolved = payload.params.resolvedCupRetainingSide ?? "rear";
      values.retaining_lip_enabled = payload.params.retainingLipEnabled ?? true;
      values.retaining_lip_thickness = `${pretty(payload.params.retainingLipThicknessMm ?? payload.params.rearLipMm ?? 0)} mm`;
      values.retaining_lip_inner_diameter = `${pretty(payload.params.retainingLipInnerDiameterMm ?? 0)} mm`;
      values.cup_front_offset_mm = `${pretty(payload.params.cupFrontOffsetMm ?? 0)} mm`;
      values.cup_rear_offset_mm = `${pretty(payload.params.cupRearOffsetMm ?? 0)} mm`;
      values.profile_segments = payload.params.profileSegments?.length ?? 0;
      if (payload.params.advancedProfile?.enabled) {
        const sectionSum = getAdvancedProfileSectionSum(payload.params.advancedProfile);
        const lengthDifference = payload.params.advancedProfile.totalLengthMm - sectionSum;
        const boreSections = buildInsertionSafeBoreSections(
          payload.params.advancedProfile,
          payload.params.seatClearanceMm,
          payload.params.resolvedCupInsertionSide ?? "front"
        );
        values.advanced_profile_enabled = "yes";
        values.totalLengthMm = `${pretty(payload.params.advancedProfile.totalLengthMm)} mm`;
        values.maxDiameterMm = `${pretty(payload.params.advancedProfile.maxDiameterMm)} mm`;
        values.maxDiameterPositionFromFrontMm = `${pretty(payload.params.advancedProfile.maxDiameterPositionFromFrontMm)} mm`;
        values.section_length_sum = `${pretty(sectionSum)} mm`;
        values.length_difference = `${pretty(lengthDifference)} mm`;
        values.number_of_sections = payload.params.advancedProfile.sections.length;
        values.insertionSafe = boreSections.length > 0;
        values.bore_sections_generated =
          boreSections.length > 0
            ? boreSections
                .map((section) => `z ${pretty(section.zStartMm)}-${pretty(section.zEndMm)} d ${pretty(section.diameterMm)}`)
                .join(" | ")
            : "none";
      }
      return values;
    }

    if (payload.type === "spacer_ring") {
      values.largest_glass_diameter = `${pretty(cascadeSizing.sourceGlassMaxDiameterMm)} mm`;
      values.carrier_inner_diameter = `${pretty(cascadeSizing.carrierInnerDiameterMm)} mm`;
      values.cup_to_carrier_clearance = `${pretty(cascadeSizing.cupToCarrierClearanceMm)} mm`;
      values.target_stack_outer_diameter = `${pretty(cascadeSizing.targetStackOuterDiameterMm)} mm`;
      values.target_stack_outer_diameter_source = cascadeSizing.targetStackOuterDiameterSource;
      values.lens_cup_outer_diameter = `${pretty(cascadeSizing.cupOuterDiameterMm ?? cascadeSizing.targetStackOuterDiameterMm)} mm`;
      values.spacer_outer_diameter = `${pretty(payload.params.outerDiameterMm)} mm`;
      values.desired_optical_air_gap_mm = `${pretty(payload.params.desiredOpticalAirGapMm ?? payload.params.thicknessMm)} mm`;
      values.printed_spacer_thickness_mm = `${pretty(payload.params.physicalSpacerThicknessMm ?? payload.params.thicknessMm)} mm`;
      values.spacer_thickness_source =
        payload.params.spacerThicknessSource ?? payload.params.physicalSpacerThicknessSource ?? "same_as_airspace";
      values.previous_cup_rear_offset_mm = `${pretty(payload.params.previousCupRearOffsetMm ?? 0)} mm`;
      values.next_cup_front_offset_mm = `${pretty(payload.params.nextCupFrontOffsetMm ?? 0)} mm`;
      values.inserted_items_total_thickness_mm = `${pretty(payload.params.insertedItemsTotalThicknessMm ?? 0)} mm`;
      values.calculated_physical_spacer_thickness_mm = `${pretty(
        payload.params.calculatedPhysicalSpacerThicknessMm ??
          payload.params.physicalSpacerThicknessMm ??
          payload.params.thicknessMm
      )} mm`;
      const spacerThicknessSource =
        payload.params.spacerThicknessSource ?? payload.params.physicalSpacerThicknessSource ?? "same_as_airspace";
      if (spacerThicknessSource === "same_as_airspace") {
        values.compensation_note = "No cup offset compensation applied yet.";
      } else if (spacerThicknessSource === "calculated_from_cup_offsets") {
        values.compensation_note = "Printed spacer thickness is offset-compensated when cup offsets are available.";
      } else {
        values.compensation_note = "Manual spacer thickness override.";
      }
      values.inner_diameter = `${pretty(payload.params.innerDiameterMm)} mm`;
      values.outer_diameter = `${pretty(payload.params.outerDiameterMm)} mm`;
      values.thickness = `${pretty(payload.params.thicknessMm)} mm`;
      values.anti_reflection_grooves = payload.params.hasAntiReflectionGrooves;
      values.chamfer_enabled = Boolean(payload.params.chamferEnabled);
      values.chamfer_mm = `${pretty(payload.params.chamferMm ?? 0)} mm`;
      return values;
    }

    if (payload.type === "iris_disk") {
      values.disk_diameter = `${pretty(payload.params.diskDiameterMm)} mm`;
      values.aperture_diameter = `${pretty(payload.params.apertureDiameterMm)} mm`;
      values.oval = payload.params.isOval;
      values.thickness = `${pretty(payload.params.thicknessMm)} mm`;
      return values;
    }

    if (payload.type === "diffusion_holder") {
      values.disk_diameter = `${pretty(payload.params.diskDiameterMm)} mm`;
      values.clear_center = `${pretty(payload.params.clearCenterDiameterMm)} mm`;
      values.diffusion_outer = `${pretty(payload.params.diffusionOuterDiameterMm)} mm`;
      values.thickness = `${pretty(payload.params.holderThicknessMm)} mm`;
      return values;
    }

    if (payload.type === "retaining_ring") {
      values.inner_diameter = `${pretty(payload.params.innerDiameterMm)} mm`;
      values.outer_diameter = `${pretty(payload.params.outerDiameterMm)} mm`;
      values.thickness = `${pretty(payload.params.thicknessMm)} mm`;
      values.notch_count = payload.params.notchCount;
      return values;
    }

    if (payload.type === "main_barrel") {
      values.inner_diameter = `${pretty(payload.params.innerDiameterMm)} mm`;
      values.outer_diameter = `${pretty(payload.params.outerDiameterMm)} mm`;
      values.length = `${pretty(payload.params.lengthMm)} mm`;
      values.screw_hole_count = payload.params.screwHoleCount;
      return values;
    }

    if (payload.type === "moving_carrier") {
      values.inner_diameter = `${pretty(payload.params.innerDiameterMm)} mm`;
      values.outer_diameter = `${pretty(payload.params.outerDiameterMm)} mm`;
      values.length = `${pretty(payload.params.lengthMm)} mm`;
      values.cam_pin_diameter = `${pretty(payload.params.camPinDiameterMm)} mm`;
      return values;
    }

    if (payload.type === "fixed_pl_barrel_with_slots") {
      values.source_glass_max_diameter = `${pretty(cascadeSizing.sourceGlassMaxDiameterMm)} mm`;
      values.cup_depth = `${pretty(cascadeSizing.cupDepthMm ?? 0)} mm`;
      values.cup_outer_diameter = `${pretty(cascadeSizing.cupOuterDiameterMm ?? 0)} mm`;
      values.carrier_length_source =
        cascadeSizing.carrierLengthSource === "optical_stack_length" ? "optical stack length + 3.0mm" : "manual";
      values.carrier_od = `${pretty(cascadeSizing.carrierOuterDiameterMm)} mm`;
      values.fixed_barrel_id = `${pretty(payload.params.mainBarrelInnerDiameterMm)} mm`;
      values.slot_length_source =
        cascadeSizing.slotLengthSource === "focus_travel" ? "focus travel" : "manual/default";
      values.inner_diameter = `${pretty(payload.params.innerDiameterMm)} mm`;
      values.outer_diameter = `${pretty(payload.params.outerDiameterMm)} mm`;
      values.total_length = `${pretty(payload.params.lengthMm)} mm`;
      values.barrel_attach_z = `${pretty(payload.params.barrelAttachZMm ?? 0)} mm`;
      values.pl_overlap = `${pretty(payload.params.plReferenceOverlapMm ?? 2)} mm`;
      values.rear_neck_od = `${pretty(payload.params.rearNeckOuterDiameterMm)} mm`;
      values.rear_neck_id = `${pretty(payload.params.rearNeckInnerDiameterMm)} mm`;
      values.rear_neck_length = `${pretty(payload.params.rearNeckLengthMm)} mm`;
      values.main_barrel_od = `${pretty(payload.params.mainBarrelOuterDiameterMm)} mm`;
      values.main_barrel_id = `${pretty(payload.params.mainBarrelInnerDiameterMm)} mm`;
      values.main_barrel_outer_diameter = `${pretty(payload.params.mainBarrelOuterDiameterMm)} mm`;
      values.barrel_inner_diameter = `${pretty(payload.params.mainBarrelInnerDiameterMm)} mm`;
      values.main_barrel_length = `${pretty(payload.params.mainBarrelLengthMm)} mm`;
      values.pl_interface_outer_diameter = `${pretty(payload.params.plInterfaceOuterDiameterMm ?? 54.9)} mm`;
      values.connector_disc_enabled = payload.params.connectorDiscEnabled ?? true;
      values.connector_disc_outer_diameter = `${pretty(payload.params.connectorDiscOuterDiameterMm ?? 0)} mm`;
      values.connector_disc_inner_diameter = `${pretty(payload.params.connectorDiscInnerDiameterMm ?? payload.params.mainBarrelInnerDiameterMm)} mm`;
      values.connector_disc_thickness = `${pretty(payload.params.connectorDiscThicknessMm ?? 0.8)} mm`;
      values.connector_overlap_into_pl = `${pretty(payload.params.connectorOverlapIntoPlMm ?? 0.8)} mm`;
      values.barrel_to_disc_overlap = `${pretty(
        payload.params.barrelToDiscOverlapMm ?? payload.params.connectorDiscOverlapWithBarrelMm ?? 0.4
      )} mm`;
      values.connector_disc_overlap_with_barrel = `${pretty(
        payload.params.connectorDiscOverlapWithBarrelMm ?? payload.params.barrelToDiscOverlapMm ?? 0.4
      )} mm`;
      values.slot_count = payload.params.slotCount;
      values.slot_width = `${pretty(payload.params.slotWidthMm)} mm`;
      values.slot_length = `${pretty(payload.params.slotLengthMm)} mm`;
      values.pin_diameter = `${pretty(payload.params.pinDiameterMm)} mm`;
      values.pin_clearance = `${pretty(payload.params.pinClearanceMm)} mm`;
      values.pl_reference_mount = payload.params.includePlReferenceMount ? "enabled" : "disabled";
      values.use_imported_pl_stl = Boolean(payload.params.useImportedPlReferenceStl);
      values.pl_reference_stl_path = payload.params.plReferenceStlPath ?? "cad/reference/PL_Lens_Tail.stl";
      return values;
    }

    if (payload.type === "sliding_optical_carrier") {
      values.source_glass_max_diameter = `${pretty(cascadeSizing.sourceGlassMaxDiameterMm)} mm`;
      values.cup_depth = `${pretty(cascadeSizing.cupDepthMm ?? 0)} mm`;
      values.cup_outer_diameter = `${pretty(cascadeSizing.cupOuterDiameterMm ?? 0)} mm`;
      values.carrier_length_source =
        cascadeSizing.carrierLengthSource === "optical_stack_length" ? "optical stack length + 3.0mm" : "manual";
      values.carrier_od = `${pretty(payload.params.outerDiameterMm)} mm`;
      values.fixed_barrel_id = `${pretty(cascadeSizing.fixedBarrelInnerDiameterMm)} mm`;
      values.slot_length_source =
        cascadeSizing.slotLengthSource === "focus_travel" ? "focus travel" : "manual/default";
      values.inner_diameter = `${pretty(payload.params.innerDiameterMm)} mm`;
      values.outer_diameter = `${pretty(payload.params.outerDiameterMm)} mm`;
      values.length = `${pretty(payload.params.lengthMm)} mm`;
      values.pin_hole_count = payload.params.pinHoleCount;
      values.pin_hole_diameter = `${pretty(payload.params.pinHoleDiameterMm)} mm`;
      values.pin_hole_z = `${pretty(payload.params.pinHoleZMm)} mm`;
      values.pin_bosses = payload.params.addPinBosses;
      values.retaining_lip_enabled = payload.params.retainingLipEnabled ?? true;
      values.retaining_lip_position = payload.params.retainingLipPosition ?? "rear";
      values.retaining_lip_thickness = `${pretty(payload.params.retainingLipThicknessMm ?? 1.2)} mm`;
      values.retaining_lip_inner_diameter = `${pretty(
        payload.params.retainingLipInnerDiameterMm ??
          Math.max(30.0, (toPositive(payload.params.opticalClearApertureMm) || 0) + 2.0)
      )} mm`;
      if (toPositive(payload.params.opticalClearApertureMm) > 0) {
        values.optical_clear_aperture = `${pretty(toPositive(payload.params.opticalClearApertureMm))} mm`;
      }
      return values;
    }

    if (payload.type === "guide_pin") {
      values.pin_shaft_diameter = `${pretty(payload.params.pinShaftDiameterMm)} mm`;
      values.pin_shaft_length = `${pretty(payload.params.pinShaftLengthMm)} mm`;
      values.pin_head_diameter = `${pretty(payload.params.pinHeadDiameterMm)} mm`;
      values.pin_head_thickness = `${pretty(payload.params.pinHeadThicknessMm)} mm`;
      values.optional_tip_chamfer = `${pretty(payload.params.tipChamferMm ?? 0)} mm`;
      values.quantity = payload.params.quantity;
      values.slot_width_reference = `${pretty(payload.params.slotWidthMm ?? guidePinSizing.slotWidthMm)} mm`;
      values.carrier_pin_hole_reference = `${pretty(
        payload.params.carrierPinHoleDiameterMm ?? guidePinSizing.carrierPinHoleDiameterMm
      )} mm`;
      values.fixed_barrel_wall_reference = `${pretty(
        payload.params.fixedBarrelWallThicknessMm ?? guidePinSizing.fixedBarrelWallThicknessMm
      )} mm`;
      values.carrier_wall_reference = `${pretty(
        payload.params.carrierWallThicknessMm ?? guidePinSizing.carrierWallThicknessMm
      )} mm`;
      values.minimum_recommended_shaft_length = `${pretty(
        guidePinSizing.minimumRecommendedShaftLengthMm
      )} mm`;
      values.print_orientation = "flat, shaft on X-axis";
      return values;
    }

    values.inner_diameter = `${pretty(payload.params.innerDiameterMm)} mm`;
    values.outer_diameter = `${pretty(payload.params.outerDiameterMm)} mm`;
    values.length = `${pretty(payload.params.lengthMm)} mm`;
    values.rotation_degrees = payload.params.rotationDegrees;
    values.axial_travel = `${pretty(payload.params.axialTravelMm)} mm`;
    return values;
  }, [payload, cascadeSizing, guidePinSizing]);

  const safetyWarnings = [
    "CAD output is a starting point for prototyping.",
    "Do not trust generated parts blindly.",
    "Check: glass cannot fall out.",
    "Check: retaining lips do not touch optical clear aperture.",
    "Check: mount/flange depth.",
    "Check: camera clearance.",
    "Check: material strength.",
    "Check: screw positions.",
    "Check: print tolerances.",
    "Check: heat/warping."
  ];

  if (project.targetMount === "PL") {
    safetyWarnings.push(
      "Do not use a 3D printed PL mount as a final load-bearing mount for valuable cameras/lenses."
    );
  }

  const onDownload = () => {
    const partLabel = safeFileName(payload.params.partName);
    const spacerThicknessToken =
      payload.type === "spacer_ring" ? `${toMmToken(payload.params.thicknessMm)}mm` : undefined;
    const filenameCore =
      payload.type === "spacer_ring" && spacerThicknessToken
        ? `sasaki_lens_lab_${partLabel}_${spacerThicknessToken}`
        : `sasaki_lens_lab_${safeFileName(project.name)}_${partLabel}`;
    const extension = exportMode === "freecad_macro" ? "FCMacro" : "scad";
    const filename = `${filenameCore}.${extension}`;
    downloadTextFile(filename, code);
  };
  const packageBaseFileName = getPackageBaseFileName(project.name);
  const packageFileNames = {
    smallParts: `${packageBaseFileName}_all_small_parts_plate.scad`,
    carrier: `${packageBaseFileName}_sliding_optical_carrier.scad`,
    fixedBarrel: `${packageBaseFileName}_fixed_pl_barrel.scad`,
    summary: `${packageBaseFileName}_prototype_summary.txt`
  };
  const packageReadyForScadDownloads =
    Boolean(builtAllPartsPackage) && (builtAllPartsPackage?.errors.length ?? 0) === 0;
  const downloadAllPartsPackageFile = (kind: "smallParts" | "carrier" | "fixedBarrel" | "summary") => {
    if (!builtAllPartsPackage) return;
    if (kind === "smallParts") {
      downloadTextFile(packageFileNames.smallParts, builtAllPartsPackage.smallPartsScad);
      return;
    }
    if (kind === "carrier") {
      downloadTextFile(packageFileNames.carrier, builtAllPartsPackage.slidingCarrierScad);
      return;
    }
    if (kind === "fixedBarrel") {
      downloadTextFile(packageFileNames.fixedBarrel, builtAllPartsPackage.fixedPlBarrelScad);
      return;
    }
    downloadTextFile(packageFileNames.summary, builtAllPartsPackage.summaryText);
  };

  return (
    <div className="space-y-4">
      <div className="panel grid gap-4 p-4 md:grid-cols-3">
        <CadPartSelector value={partType} onChange={setPartType} />
        <Select
          label="Source Item"
          value={sourceItemId ?? ""}
          onChange={(event) => setSourceItemId(event.target.value)}
          disabled={sourceCandidates.length === 0}
        >
          {sourceCandidates.length === 0 && <option value="">No matching stack item</option>}
          {sourceCandidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.sourceItem.name}
            </option>
          ))}
        </Select>
        <Select
          label="CAD Export Mode"
          value={exportMode}
          onChange={(event) => setExportMode(event.target.value as "openscad" | "freecad_macro")}
        >
          <option value="openscad">OpenSCAD (.scad)</option>
          <option value="freecad_macro">
            {partType === "fixed_pl_barrel_with_slots"
              ? "FreeCAD Assembly Macro with PL STEP (.FCMacro)"
              : "FreeCAD Macro (.FCMacro)"}
          </option>
        </Select>
      </div>

      {partType === "fixed_pl_barrel_with_slots" && (
        <div className="panel space-y-3 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-labMuted">PL Alignment Controls</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <NumberInput
              label="barrel_attach_z (mm)"
              value={fixedPlBarrelAttachZMm}
              step={0.1}
              onChange={(event) =>
                setFixedPlBarrelAttachZMm(
                  Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : 0
                )
              }
            />
            <NumberInput
              label="pl_overlap (mm)"
              value={fixedPlOverlapMm}
              min={2}
              step={0.1}
              onChange={(event) =>
                setFixedPlOverlapMm(
                  Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : 2
                )
              }
            />
          </div>
          <p className="text-sm text-labMuted">
            Use barrel_attach_z to move the generated barrel toward/away from the imported PL STL. Use pl_overlap to
            make sure the generated barrel physically overlaps the PL reference and does not float.
          </p>
        </div>
      )}

      {partType === "sliding_optical_carrier" && (
        <div className="panel space-y-3 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-labMuted">
            Sliding Carrier Controls
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="Carrier length source"
              value={slidingCarrierLengthSource}
              onChange={(event) =>
                setSlidingCarrierLengthSource(event.target.value as SlidingCarrierLengthSource)
              }
            >
              <option value="manual">manual</option>
              <option value="lens_cup_or_stack">from full optical stack length</option>
            </Select>
            <NumberInput
              label="Carrier length manual (mm)"
              value={slidingCarrierManualLengthMm}
              min={8}
              step={0.1}
              onChange={(event) =>
                setSlidingCarrierManualLengthMm(
                  Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : 48
                )
              }
              disabled={slidingCarrierLengthSource !== "manual"}
            />
          </div>
          <p className="text-sm text-labMuted">
            In automatic mode, carrier length defaults to optical stack length + 3.0mm.
          </p>
        </div>
      )}

      {partType === "guide_pin" && (
        <div className="panel space-y-3 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-labMuted">
            Guide Pin Controls
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <NumberInput
              label="Pin shaft diameter (mm)"
              value={guidePinResolved.pinShaftDiameterMm}
              min={0.5}
              step={0.05}
              onChange={(event) =>
                setGuidePinOverride(
                  "pinShaftDiameterMm",
                  Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : undefined
                )
              }
            />
            <NumberInput
              label="Pin shaft length (mm)"
              value={guidePinResolved.pinShaftLengthMm}
              min={1}
              step={0.1}
              onChange={(event) =>
                setGuidePinOverride(
                  "pinShaftLengthMm",
                  Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : undefined
                )
              }
            />
            <NumberInput
              label="Pin head diameter (mm)"
              value={guidePinResolved.pinHeadDiameterMm}
              min={1}
              step={0.1}
              onChange={(event) =>
                setGuidePinOverride(
                  "pinHeadDiameterMm",
                  Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : undefined
                )
              }
            />
            <NumberInput
              label="Pin head thickness (mm)"
              value={guidePinResolved.pinHeadThicknessMm}
              min={0.4}
              step={0.05}
              onChange={(event) =>
                setGuidePinOverride(
                  "pinHeadThicknessMm",
                  Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : undefined
                )
              }
            />
            <NumberInput
              label="Optional tip chamfer (mm)"
              value={guidePinResolved.tipChamferMm}
              min={0}
              step={0.05}
              onChange={(event) =>
                setGuidePinOverride(
                  "tipChamferMm",
                  Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : undefined
                )
              }
            />
            <NumberInput
              label="Quantity"
              value={guidePinResolved.quantity}
              min={1}
              step={1}
              onChange={(event) =>
                setGuidePinOverride(
                  "quantity",
                  Number.isFinite(event.target.valueAsNumber)
                    ? Math.max(1, Math.round(event.target.valueAsNumber))
                    : undefined
                )
              }
            />
          </div>
          <p className="text-sm text-labMuted">
            Auto size defaults: shaft diameter = min(slot width, carrier pin hole) - 0.2mm. If exact wall engagement
            data is unavailable, an 8.0mm shaft length baseline is used.
          </p>
        </div>
      )}

      <div className="panel space-y-3 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-labMuted">
          Build All Parts Package
        </h3>
        <p className="text-sm text-labMuted">
          Builds a complete prototype CAD package from the current stack. Small parts are placed together on one
          OpenSCAD print plate. Carrier and fixed PL barrel are exported separately for easier orientation and print
          settings.
        </p>
        <Button type="button" variant="primary" className="w-full md:w-auto" onClick={buildAllPartsPackage}>
          Build All Parts Package
        </Button>
        {builtAllPartsPackage && (
          <div className="space-y-3 rounded-xl border border-labBorder bg-[#0b0b0b] p-3">
            <p className="text-xs text-labMuted">
              Last built: <span className="mono text-labText">{builtAllPartsPackage.builtAtIso}</span>
            </p>
            {(builtAllPartsPackage.errors.length ?? 0) > 0 ? (
              <p className="text-xs text-labDanger">
                Package has blocking geometry errors. Fix errors before downloading SCAD files.
              </p>
            ) : (
              <p className="text-xs text-labMuted">
                Package is ready. Download files below.
              </p>
            )}
            <div className="grid gap-2 md:grid-cols-2">
              <Button
                type="button"
                onClick={() => downloadAllPartsPackageFile("smallParts")}
                disabled={!packageReadyForScadDownloads}
              >
                Download all small parts plate
              </Button>
              <Button
                type="button"
                onClick={() => downloadAllPartsPackageFile("carrier")}
                disabled={!packageReadyForScadDownloads}
              >
                Download carrier
              </Button>
              <Button
                type="button"
                onClick={() => downloadAllPartsPackageFile("fixedBarrel")}
                disabled={!packageReadyForScadDownloads}
              >
                Download fixed PL barrel
              </Button>
              <Button type="button" onClick={() => downloadAllPartsPackageFile("summary")}>
                Download package summary
              </Button>
            </div>
            <p className="text-xs text-labMuted">
              Files: {packageFileNames.smallParts}, {packageFileNames.carrier}, {packageFileNames.fixedBarrel},{" "}
              {packageFileNames.summary}
            </p>
            <WarningBox title="Package Warnings" lines={builtAllPartsPackage.warnings} />
            <WarningBox title="Package Errors" lines={builtAllPartsPackage.errors} />
          </div>
        )}
      </div>

      <AssemblyPreviewPanel project={project} />

      <PartSpecCard title="Auto-fit System" specs={autoFitSystemSpecs} />
      <PartSpecCard title="Part Specs" specs={specs} />
      <WarningBox title="Export Mode Notes" lines={exportModeWarnings} />
      <WarningBox title="Part Warnings" lines={partWarnings} />
      <WarningBox title="Safety Checks" lines={safetyWarnings} />
      <ScadCodeViewer
        code={code}
        onDownload={onDownload}
        codeTitle={exportMode === "freecad_macro" ? "FreeCAD Macro" : "OpenSCAD Code"}
        copyLabel={exportMode === "freecad_macro" ? "Copy FreeCAD Macro" : "Copy OpenSCAD"}
        downloadLabel={exportMode === "freecad_macro" ? "Download .FCMacro" : "Download .scad"}
      />
    </div>
  );
}
