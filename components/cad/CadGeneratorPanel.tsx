"use client";

import { useEffect, useMemo, useState } from "react";
import { CadPartSelector, type CadPartType } from "@/components/cad/CadPartSelector";
import { PartSpecCard } from "@/components/cad/PartSpecCard";
import { ScadCodeViewer } from "@/components/cad/ScadCodeViewer";
import { NumberInput } from "@/components/common/NumberInput";
import { Select } from "@/components/common/Select";
import { WarningBox } from "@/components/common/WarningBox";
import {
  getPartWarnings,
  getLargestGlassDiameter,
  getRecommendedBarrelInnerDiameter,
  getRecommendedBarrelOuterDiameter,
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
  targetMountThroatDiameterMm?: number;
  recommendedPrototypeTravelMm?: number;
  prototypeStartMm?: number;
};

type SlidingCarrierLengthSource = "manual" | "lens_cup_or_stack";

type SlidingCarrierOverrides = {
  lengthSource: SlidingCarrierLengthSource;
  manualLengthMm: number;
};

type CarrierLengthDerivedSource = "manual" | "cup_depth" | "optical_stack_length";
type CarrierInnerBaseSource = "cup_outer_diameter" | "largest_glass_diameter";
type SlotLengthSource = "focus_travel" | "manual_default";

type CascadeSizing = {
  sourceGlass?: Extract<StackItem, { type: "glass" }>;
  sourceGlassMaxDiameterMm: number;
  cupDepthMm?: number;
  cupOuterDiameterMm?: number;
  cupToCarrierClearanceMm: number;
  targetStackOuterDiameterMm: number;
  targetStackOuterDiameterSource: "manual" | "carrier_inner" | "fixed_barrel_inner" | "largest_glass_fallback";
  carrierLengthMm: number;
  carrierLengthSource: CarrierLengthDerivedSource;
  carrierInnerDiameterMm: number;
  carrierInnerBaseSource: CarrierInnerBaseSource;
  carrierOuterDiameterMm: number;
  carrierFitClearanceMm: number;
  fixedBarrelInnerDiameterMm: number;
  slidingClearanceMm: number;
  slotLengthMm: number;
  slotLengthSource: SlotLengthSource;
  slotStartFromMainBarrelMm: number;
  barrelEndMarginMm: number;
  mainBarrelLengthMm: number;
};

const CARRIER_LENGTH_MARGIN_MM = 3.0;
const MIN_CARRIER_LENGTH_MM = 18.0;
const MAX_CARRIER_LENGTH_MM = 120.0;
const MIN_CARRIER_FIT_CLEARANCE_DIAMETER_MM = 0.6;
const DEFAULT_SLIDING_CLEARANCE_DIAMETER_MM = 0.8;
const DEFAULT_CUP_TO_CARRIER_CLEARANCE_MM = 0.6;
const DEFAULT_BARREL_END_MARGIN_MM = 8.0;
const MIN_CUP_WALL_THICKNESS_MM = 1.2;

function toFiniteOrUndefined(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getFocusTravelDerived(project: LensProject): {
  recommendedPrototypeTravelMm?: number;
  prototypeStartMm?: number;
  targetMountThroatDiameterMm?: number;
} {
  const focus = (project as unknown as { focusTravel?: FocusTravelLike }).focusTravel;
  if (!focus) {
    return {};
  }

  const directRecommended = toFiniteOrUndefined(focus.recommendedPrototypeTravelMm);
  const directStart = toFiniteOrUndefined(focus.prototypeStartMm);
  if (directRecommended && directRecommended > 0) {
    return {
      recommendedPrototypeTravelMm: directRecommended,
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
  const targetPositionClose = donorClose - targetOffset;
  const prototypeStart = targetPositionInfinity - overtravel;
  const prototypeEnd = targetPositionClose + closeMargin;
  const recommendedTravel = prototypeEnd - prototypeStart;

  return {
    recommendedPrototypeTravelMm: recommendedTravel > 0 ? recommendedTravel : undefined,
    prototypeStartMm: prototypeStart,
    targetMountThroatDiameterMm: toFiniteOrUndefined(focus.targetMountThroatDiameterMm)
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

function resolveCascadeSourceGlass(
  project: LensProject,
  preferredSource?: StackItem
): Extract<StackItem, { type: "glass" }> | undefined {
  if (preferredSource?.type === "glass") return preferredSource;
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
  return isAdvancedSteppedCup(glass) ? Math.max(defaults.retainingLipMm, 1.2) : defaults.retainingLipMm;
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
  sourceGlass,
  defaults,
  fallbackLengthMm,
  lengthSource,
  manualLengthMm
}: {
  project: LensProject;
  sourceGlass: Extract<StackItem, { type: "glass" }> | undefined;
  defaults: CadDefaults;
  fallbackLengthMm: number;
  lengthSource: SlidingCarrierLengthSource;
  manualLengthMm: number;
}): { lengthMm: number; source: CarrierLengthDerivedSource } {
  if (lengthSource === "manual") {
    const manual = Number.isFinite(manualLengthMm) ? manualLengthMm : 0;
    return { lengthMm: Number(Math.max(8, manual).toFixed(3)), source: "manual" };
  }

  const cupDepthMm = estimateLensCupDepthMm(sourceGlass, defaults);
  if (cupDepthMm && cupDepthMm > 0) {
    return {
      lengthMm: Number(Math.max(MIN_CARRIER_LENGTH_MM, Math.min(cupDepthMm + CARRIER_LENGTH_MARGIN_MM, MAX_CARRIER_LENGTH_MM)).toFixed(3)),
      source: "cup_depth"
    };
  }
  const stackLengthMm = getTotalStackLength(project.stackItems);
  if (stackLengthMm > 0) {
    return {
      lengthMm: Number(Math.max(MIN_CARRIER_LENGTH_MM, Math.min(stackLengthMm + CARRIER_LENGTH_MARGIN_MM, MAX_CARRIER_LENGTH_MM)).toFixed(3)),
      source: "optical_stack_length"
    };
  }
  const fallback = Number.isFinite(fallbackLengthMm) ? fallbackLengthMm : 0;
  return { lengthMm: Number(Math.max(8, fallback).toFixed(3)), source: "manual" };
}

function deriveCascadeSizing({
  project,
  preferredSource,
  defaults,
  focusDerived,
  plSlotLengthManual,
  slidingCarrierOverrides
}: {
  project: LensProject;
  preferredSource?: StackItem;
  defaults: CadDefaults;
  focusDerived: ReturnType<typeof getFocusTravelDerived>;
  plSlotLengthManual: number;
  slidingCarrierOverrides?: SlidingCarrierOverrides;
}): CascadeSizing {
  const sourceGlass = resolveCascadeSourceGlass(project, preferredSource);
  const measuredSourceGlassMaxDiameter = getMeasuredGlassMaxDiameterMm(sourceGlass);
  const fallbackLargestGlassDiameter = getLargestGlassDiameter(project.stackItems);
  const sourceGlassMaxDiameterMm =
    measuredSourceGlassMaxDiameter > 0 ? measuredSourceGlassMaxDiameter : fallbackLargestGlassDiameter;

  const cupDepthMm = estimateLensCupDepthMm(sourceGlass, defaults);
  const localCupOuterDiameterMm =
    sourceGlassMaxDiameterMm > 0
      ? Number((sourceGlassMaxDiameterMm + defaults.wallThicknessMm * 2).toFixed(3))
      : undefined;

  const focusTravelMm = focusDerived.recommendedPrototypeTravelMm ?? plSlotLengthManual;
  const carrierLengthResolved = resolveSlidingCarrierLengthMm({
    project,
    sourceGlass,
    defaults,
    fallbackLengthMm: slidingCarrierOverrides?.manualLengthMm ?? focusTravelMm,
    lengthSource: slidingCarrierOverrides?.lengthSource ?? "lens_cup_or_stack",
    manualLengthMm: slidingCarrierOverrides?.manualLengthMm ?? 48
  });

  const carrierInnerBaseSource: CarrierInnerBaseSource =
    localCupOuterDiameterMm && localCupOuterDiameterMm > 0 ? "cup_outer_diameter" : "largest_glass_diameter";
  const carrierInnerBaseDiameter =
    carrierInnerBaseSource === "cup_outer_diameter"
      ? (localCupOuterDiameterMm as number)
      : sourceGlassMaxDiameterMm;
  const carrierFitClearanceMm = Math.max(
    MIN_CARRIER_FIT_CLEARANCE_DIAMETER_MM,
    (defaults.radialClearanceMm + defaults.printToleranceMm) * 2
  );
  const carrierInnerDiameterMm = Number(
    Math.max(carrierInnerBaseDiameter + carrierFitClearanceMm, defaults.defaultInnerDiameterMm - 2).toFixed(3)
  );
  const carrierOuterDiameterMm = Number((carrierInnerDiameterMm + defaults.wallThicknessMm * 2).toFixed(3));

  const slidingClearanceMm = DEFAULT_SLIDING_CLEARANCE_DIAMETER_MM;
  const fixedBarrelInnerDiameterMm = Number((carrierOuterDiameterMm + slidingClearanceMm).toFixed(3));
  const cupToCarrierClearanceMm = Math.max(0, defaults.cupToCarrierClearanceMm ?? DEFAULT_CUP_TO_CARRIER_CLEARANCE_MM);
  const manualTargetStackOuterDiameterMm = toPositive(defaults.targetStackOuterDiameterMm);
  const fixedBarrelInnerCandidateMm = Math.max(
    fixedBarrelInnerDiameterMm,
    toPositive(defaults.plMainBarrelInnerDiameterMm)
  );
  const computedTargetStackFromCarrierMm = carrierInnerDiameterMm - cupToCarrierClearanceMm;
  const computedTargetStackFromFixedBarrelMm =
    fixedBarrelInnerCandidateMm - slidingClearanceMm - cupToCarrierClearanceMm;
  const fallbackTargetStackOuterDiameterMm = sourceGlassMaxDiameterMm > 0 ? sourceGlassMaxDiameterMm + 6.0 : 0;

  let targetStackOuterDiameterSource: CascadeSizing["targetStackOuterDiameterSource"];
  let targetStackOuterDiameterMmRaw = 0;
  if (manualTargetStackOuterDiameterMm > 0) {
    targetStackOuterDiameterSource = "manual";
    targetStackOuterDiameterMmRaw = manualTargetStackOuterDiameterMm;
  } else if (computedTargetStackFromCarrierMm > 0) {
    targetStackOuterDiameterSource = "carrier_inner";
    targetStackOuterDiameterMmRaw = computedTargetStackFromCarrierMm;
  } else if (computedTargetStackFromFixedBarrelMm > 0) {
    targetStackOuterDiameterSource = "fixed_barrel_inner";
    targetStackOuterDiameterMmRaw = computedTargetStackFromFixedBarrelMm;
  } else {
    targetStackOuterDiameterSource = "largest_glass_fallback";
    targetStackOuterDiameterMmRaw = fallbackTargetStackOuterDiameterMm;
  }
  const targetStackOuterDiameterMm = Number(Math.max(4, targetStackOuterDiameterMmRaw).toFixed(3));
  const cupOuterDiameterMm = targetStackOuterDiameterMm;

  const slotLengthSource: SlotLengthSource =
    focusDerived.recommendedPrototypeTravelMm && focusDerived.recommendedPrototypeTravelMm > 0
      ? "focus_travel"
      : "manual_default";
  const slotLengthBase = focusDerived.recommendedPrototypeTravelMm ?? plSlotLengthManual;
  const slotLengthMm = Number(Math.max(slotLengthBase + 2, 6).toFixed(3));
  const slotStartFromMainBarrelMm = Math.max(0, defaults.plSlotStartFromMainBarrelMm ?? 8.0);
  const barrelEndMarginMm = DEFAULT_BARREL_END_MARGIN_MM;
  const derivedMainBarrelLengthMm = slotStartFromMainBarrelMm + slotLengthMm + barrelEndMarginMm;
  const requestedMainBarrelLengthMm = Number.isFinite(defaults.plMainBarrelLengthMm ?? Number.NaN)
    ? (defaults.plMainBarrelLengthMm as number)
    : undefined;
  const mainBarrelLengthMm = Number(
    Math.max(derivedMainBarrelLengthMm, requestedMainBarrelLengthMm ?? derivedMainBarrelLengthMm).toFixed(3)
  );

  return {
    sourceGlass,
    sourceGlassMaxDiameterMm,
    cupDepthMm,
    cupOuterDiameterMm,
    cupToCarrierClearanceMm,
    targetStackOuterDiameterMm,
    targetStackOuterDiameterSource,
    carrierLengthMm: carrierLengthResolved.lengthMm,
    carrierLengthSource: carrierLengthResolved.source,
    carrierInnerDiameterMm,
    carrierInnerBaseSource,
    carrierOuterDiameterMm,
    carrierFitClearanceMm,
    fixedBarrelInnerDiameterMm,
    slidingClearanceMm,
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
  seatClearanceMm: number
): Array<{ zStartMm: number; zEndMm: number; diameterMm: number }> {
  if (!profile?.enabled) return [];
  const sections = (profile.sections ?? [])
    .slice()
    .sort((a, b) => a.index - b.index)
    .filter((section) => toPositive(section.diameterMm) > 0 && toPositive(section.lengthMm) > 0);
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
  cascadeSizing?: CascadeSizing
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
  const plMainBarrelInnerDefault = defaults.plMainBarrelInnerDiameterMm ?? 40.0;
  const plStepUpStart = defaults.plStepUpStartFromFlangeMm ?? 12.0;
  const plSlotCount = Math.max(2, Math.round(defaults.plSlotCount ?? 2));
  const plSlotAngleOffset = defaults.plSlotAngleOffsetDeg ?? 0;
  const plSlotLengthManual = defaults.plSlotLengthManualMm ?? 30.0;
  const plSlotStartZ = defaults.plSlotStartZMm ?? 13.0;
  const plPinDiameter = Math.max(1, defaults.plPinDiameterMm ?? defaults.camPinDiameterMm ?? 2);
  const plPinClearance = Math.max(0.1, defaults.plPinClearanceMm ?? 0.3);
  const cascade =
    cascadeSizing ??
    deriveCascadeSizing({
      project,
      preferredSource: source,
      defaults,
      focusDerived,
      plSlotLengthManual,
      slidingCarrierOverrides
    });

  switch (partType) {
    case "element_cup": {
      const glass =
        (source?.type === "glass" ? source : undefined) ??
        cascade.sourceGlass;
      const rearLipMm = getElementCupRearLipDefaultMm(glass, defaults);
      const advancedProfile = normalizeAdvancedProfileForCup(glass);
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
      const glassDiameterMm =
        cascade.sourceGlassMaxDiameterMm > 0 ? cascade.sourceGlassMaxDiameterMm : (glass?.diameterMm ?? defaults.defaultInnerDiameterMm - 4);
      const seatClearanceMm = defaults.printToleranceMm;
      const resolvedOuterDiameter =
        cascade.cupOuterDiameterMm && cascade.cupOuterDiameterMm > 0
          ? cascade.cupOuterDiameterMm
          : Number((glassDiameterMm + defaults.wallThicknessMm * 2).toFixed(3));

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
          retainingLipMm: defaults.retainingLipMm,
          rearLipMm: Number(rearLipMm.toFixed(3)),
          cupDepthMm: cascade.cupDepthMm ? Number(cascade.cupDepthMm.toFixed(3)) : undefined,
          facets: defaults.facets
        }
      };
    }
    case "spacer_ring": {
      const spacer = source?.type === "spacer" ? source : undefined;
      const spacerPartName = `spacer_air_gap_${safeFileName(sourceName || "ring")}`;
      const sourceClearApertureMm = toPositive(cascade.sourceGlass?.clearApertureMm);
      const defaultSpacerInnerDiameterMm = sourceClearApertureMm > 0 ? sourceClearApertureMm + 2.0 : 30.0;
      const resolvedSpacerInnerDiameterMm =
        toPositive(spacer?.innerDiameterMm) > 0 ? (spacer?.innerDiameterMm as number) : defaultSpacerInnerDiameterMm;
      const resolvedSpacerOuterDiameterMm =
        cascade.targetStackOuterDiameterMm > 0
          ? cascade.targetStackOuterDiameterMm
          : toPositive(spacer?.outerDiameterMm) > 0
            ? (spacer?.outerDiameterMm as number)
            : defaults.defaultOuterDiameterMm;
      return {
        type: "spacer_ring",
        params: {
          partName: spacerPartName,
          innerDiameterMm: Number(resolvedSpacerInnerDiameterMm.toFixed(3)),
          outerDiameterMm: Number(resolvedSpacerOuterDiameterMm.toFixed(3)),
          thicknessMm: spacer?.thicknessMm ?? defaults.partThicknessMm,
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
      const requestedMainBarrelInner = Number.isFinite(defaults.plMainBarrelInnerDiameterMm ?? Number.NaN)
        ? (defaults.plMainBarrelInnerDiameterMm as number)
        : undefined;
      const mainBarrelInner = Math.max(
        plMainBarrelInnerDefault,
        cascade.fixedBarrelInnerDiameterMm,
        requestedMainBarrelInner ?? 0
      );
      const defaultMainBarrelOuter = Number((mainBarrelInner + 4.0).toFixed(3));
      const requestedMainBarrelOuter = Number.isFinite(defaults.plMainBarrelOuterDiameterMm ?? Number.NaN)
        ? (defaults.plMainBarrelOuterDiameterMm as number)
        : undefined;
      const mainBarrelOuter =
        typeof requestedMainBarrelOuter === "number" && requestedMainBarrelOuter > mainBarrelInner
          ? Number(requestedMainBarrelOuter.toFixed(3))
          : defaultMainBarrelOuter;
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
      const stepUpStart = Math.max(
        plLockClearanceLength,
        plStepUpStart
      );
      const plInterfaceOuterDiameter = Math.max(1, defaults.plInterfaceOuterDiameterMm ?? 54.9);
      const connectorDiscEnabledByFit = mainBarrelOuter < plInterfaceOuterDiameter;
      const connectorDiscEnabled = defaults.connectorDiscEnabled ?? connectorDiscEnabledByFit;
      const connectorDiscThickness = Math.max(0, defaults.connectorDiscThicknessMm ?? 0.8);
      const connectorOverlapIntoPl = Math.max(0, defaults.connectorOverlapIntoPlMm ?? 0.8);
      const barrelToDiscOverlap = Math.max(
        0,
        defaults.barrelToDiscOverlapMm ?? defaults.connectorDiscOverlapWithBarrelMm ?? 0.4
      );
      const connectorDiscOuterDiameterDefault = Math.max(plInterfaceOuterDiameter, mainBarrelOuter);
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
  const plAssemblyIncludeMain = project.cadDefaults.plAssemblyIncludeMainBarrelSection ?? true;
  const plAssemblyIncludeCarrier = project.cadDefaults.plAssemblyIncludeMovingCarrier ?? true;
  const plAssemblyIncludePins = project.cadDefaults.plAssemblyIncludeGuidePins ?? true;
  const plAssemblyFuse = project.cadDefaults.plAssemblyFuseBarrelToPl ?? false;
  const plStepReferencePath = resolvePlStepPath(project.cadDefaults.plStepReferencePath);
  const focusDerived = getFocusTravelDerived(project);
  const plSlotLengthManual = project.cadDefaults.plSlotLengthManualMm ?? 30.0;

  const sourceCandidates = useMemo(() => {
    const requiredType = needsSource[partType];
    if (!requiredType) return [];
    return project.stackItems.filter((item) => item.type === requiredType);
  }, [partType, project.stackItems]);

  useEffect(() => {
    if (!sourceCandidates.length) {
      setSourceItemId(undefined);
      return;
    }
    setSourceItemId((current) => (current && sourceCandidates.some((item) => item.id === current) ? current : sourceCandidates[0].id));
  }, [sourceCandidates]);

  useEffect(() => {
    setFixedPlBarrelAttachZMm(project.cadDefaults.plBarrelAttachZMm ?? 0.0);
    setFixedPlOverlapMm(Math.max(2.0, project.cadDefaults.plReferenceOverlapMm ?? 2.0));
  }, [project.cadDefaults.plBarrelAttachZMm, project.cadDefaults.plReferenceOverlapMm]);

  const sourceItem = sourceCandidates.find((item) => item.id === sourceItemId);
  const slidingCarrierOverrides: SlidingCarrierOverrides = {
    lengthSource: slidingCarrierLengthSource,
    manualLengthMm: slidingCarrierManualLengthMm
  };
  const cascadeSizing = deriveCascadeSizing({
    project,
    preferredSource: sourceItem,
    defaults: project.cadDefaults,
    focusDerived,
    plSlotLengthManual,
    slidingCarrierOverrides
  });
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
    cascadeSizing
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
    const minimumUsefulLength = slotStartFromMain + payload.params.slotLengthMm + 4;
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
    const fixedBarrelInnerDiameter = Math.max(
      cascadeSizing.fixedBarrelInnerDiameterMm,
      project.cadDefaults.plMainBarrelInnerDiameterMm ?? 0
    );
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
    if (wallThickness < 1.2) {
      warnings.push(
        "Carrier wall is very thin for pin holes and may break. Increase barrel ID, reduce carrier ID, or use a larger outer carrier."
      );
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
  const elementCupValidationWarnings = (() => {
    if (payload.type !== "element_cup") return [] as string[];
    const warnings: string[] = [];
    const targetStackOuterDiameterMm = toPositive(cascadeSizing.targetStackOuterDiameterMm);
    const minimumCupOuterDiameterMm = payload.params.glassDiameterMm + MIN_CUP_WALL_THICKNESS_MM * 2;
    if (targetStackOuterDiameterMm > 0 && targetStackOuterDiameterMm <= minimumCupOuterDiameterMm) {
      warnings.push("Target stack OD is too small for this glass/cup wall thickness.");
    }

    if (payload.params.advancedProfile?.enabled) {
      const advanced = payload.params.advancedProfile;
      const sortedSections = (advanced.sections ?? [])
        .slice()
        .sort((a, b) => a.index - b.index)
        .filter((section) => section.diameterMm > 0 && section.lengthMm > 0);
      if (!sortedSections.length) return warnings;
      const lastMeasuredDiameter = sortedSections[sortedSections.length - 1]?.diameterMm ?? advanced.maxDiameterMm;
      const defaultRearClearHole = Math.max(lastMeasuredDiameter - 2.0, 0.4);
      const requestedRearClearHole = Math.max(advanced.rearClearHoleMm ?? defaultRearClearHole, 0.4);
      const insertionSafeBoreSections = buildInsertionSafeBoreSections(advanced, payload.params.seatClearanceMm);
      const lastBoreDiameter =
        insertionSafeBoreSections[insertionSafeBoreSections.length - 1]?.diameterMm ??
        advanced.maxDiameterMm + payload.params.seatClearanceMm;
      if (requestedRearClearHole >= lastBoreDiameter) {
        warnings.push("Rear clear hole is too large; no retaining lip remains.");
      }
      if (payload.params.rearLipMm < 0.8) {
        warnings.push("Rear retaining lip may be too thin.");
      }
    }
    return warnings;
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
          "Main barrel length should usually be slot start + slot length + a few mm of end margin. For the default 8mm start and 32mm slot, 48mm is a good prototype length."
        ]
      : []),
    ...(fixedPlClearanceValidationWarning ? [fixedPlClearanceValidationWarning] : []),
    ...(fixedPlMainBarrelLengthWarning ? [fixedPlMainBarrelLengthWarning] : []),
    ...(fixedPlConnectorDiscWarning ? [fixedPlConnectorDiscWarning] : []),
    ...(fixedPlConnectorDiscThicknessWarning ? [fixedPlConnectorDiscThicknessWarning] : [])
  ];
  const partWarnings = [
    ...(sourceItem ? getPartWarnings(sourceItem, project.cadDefaults) : []),
    ...elementCupValidationWarnings,
    ...slidingCarrierValidationWarnings
  ];

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
      values.profile_segments = payload.params.profileSegments?.length ?? 0;
      if (payload.params.advancedProfile?.enabled) {
        const sectionSum = getAdvancedProfileSectionSum(payload.params.advancedProfile);
        const lengthDifference = payload.params.advancedProfile.totalLengthMm - sectionSum;
        const boreSections = buildInsertionSafeBoreSections(
          payload.params.advancedProfile,
          payload.params.seatClearanceMm
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
        cascadeSizing.carrierLengthSource === "cup_depth"
          ? "cup depth + 3.0mm"
          : cascadeSizing.carrierLengthSource === "optical_stack_length"
            ? "optical stack length + 3.0mm"
            : "manual";
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
        cascadeSizing.carrierLengthSource === "cup_depth"
          ? "cup depth + 3.0mm"
          : cascadeSizing.carrierLengthSource === "optical_stack_length"
            ? "optical stack length + 3.0mm"
            : "manual";
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

    values.inner_diameter = `${pretty(payload.params.innerDiameterMm)} mm`;
    values.outer_diameter = `${pretty(payload.params.outerDiameterMm)} mm`;
    values.length = `${pretty(payload.params.lengthMm)} mm`;
    values.rotation_degrees = payload.params.rotationDegrees;
    values.axial_travel = `${pretty(payload.params.axialTravelMm)} mm`;
    return values;
  }, [payload, cascadeSizing]);

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
          {sourceCandidates.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
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
              <option value="lens_cup_or_stack">from selected lens cup / optical stack length</option>
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
            In automatic mode, carrier length defaults to cup depth + 3.0mm when a lens cup source is available,
            otherwise it falls back to optical stack length + 3.0mm.
          </p>
        </div>
      )}

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
