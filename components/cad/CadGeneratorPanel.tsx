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
import type { ElementCupParams, LensProject, StackItem } from "@/types";

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
  sliding_optical_carrier: null,
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

function getNearestBarrelInnerDiameter(items: StackItem[], source?: StackItem): number | undefined {
  const barrels = items.filter(
    (item): item is Extract<StackItem, { type: "barrel" }> =>
      item.type === "barrel" && toPositive(item.innerDiameterMm) > 0
  );
  if (!barrels.length) return undefined;
  if (!source) return barrels[0].innerDiameterMm;

  const sourceIndex = source.positionIndex;
  const nearest = barrels.reduce((best, current) => {
    const bestDistance = Math.abs(best.positionIndex - sourceIndex);
    const currentDistance = Math.abs(current.positionIndex - sourceIndex);
    return currentDistance < bestDistance ? current : best;
  });
  return nearest.innerDiameterMm;
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
  fixedPlOverrides?: { barrelAttachZMm: number; plOverlapMm: number }
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
  const plMainBarrelOuterDefault = defaults.plMainBarrelOuterDiameterMm ?? 44.0;
  const plMainBarrelInnerDefault = defaults.plMainBarrelInnerDiameterMm ?? 40.0;
  const plMainBarrelLengthDefault = defaults.plMainBarrelLengthMm ?? 50.0;
  const plStepUpStart = defaults.plStepUpStartFromFlangeMm ?? 12.0;
  const plSlotCount = Math.max(2, Math.round(defaults.plSlotCount ?? 2));
  const plSlotAngleOffset = defaults.plSlotAngleOffsetDeg ?? 0;
  const plSlotLengthManual = defaults.plSlotLengthManualMm ?? 30.0;
  const plSlotStartZ = defaults.plSlotStartZMm ?? 13.0;
  const plPinDiameter = Math.max(1, defaults.plPinDiameterMm ?? defaults.camPinDiameterMm ?? 2);
  const plPinClearance = Math.max(0.1, defaults.plPinClearanceMm ?? 0.3);
  const plAssemblyIncludeMain = defaults.plAssemblyIncludeMainBarrelSection ?? true;
  const plAssemblyIncludeCarrier = defaults.plAssemblyIncludeMovingCarrier ?? true;
  const plAssemblyIncludePins = defaults.plAssemblyIncludeGuidePins ?? true;
  const plAssemblyFuse = defaults.plAssemblyFuseBarrelToPl ?? false;
  const plStepReferencePath = resolvePlStepPath(defaults.plStepReferencePath);

  switch (partType) {
    case "element_cup": {
      const glass = source?.type === "glass" ? source : undefined;
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
      const glassDiameterMm = glass?.diameterMm ?? defaults.defaultInnerDiameterMm - 4;
      const seatClearanceMm = defaults.printToleranceMm;
      const seatDiameterMm = glassDiameterMm + seatClearanceMm;
      const minimumOuterFromSeat = seatDiameterMm + Math.max(defaults.wallThicknessMm * 2, 1.6);
      const nearestBarrelInner = getNearestBarrelInnerDiameter(project.stackItems, source);
      const recommendedBarrelInner = getRecommendedBarrelInnerDiameter(project.stackItems, defaults);
      const effectiveBarrelInner = Math.max(
        toPositive(nearestBarrelInner),
        toPositive(recommendedBarrelInner)
      );
      const fitClearancePerSide = Math.max(defaults.radialClearanceMm + defaults.printToleranceMm, 0.25);
      const barrelFitOuter =
        effectiveBarrelInner > 0
          ? effectiveBarrelInner - fitClearancePerSide * 2
          : undefined;
      const resolvedOuterDiameter = Math.max(
        minimumOuterFromSeat,
        barrelFitOuter ?? minimumOuterFromSeat
      );
      const resolvedWallThickness = Math.max(
        defaults.wallThicknessMm,
        (resolvedOuterDiameter - seatDiameterMm) / 2
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
          wallThicknessMm: Number(resolvedWallThickness.toFixed(3)),
          outerDiameterMm: Number(resolvedOuterDiameter.toFixed(3)),
          retainingLipMm: defaults.retainingLipMm,
          rearLipMm: defaults.retainingLipMm,
          facets: defaults.facets
        }
      };
    }
    case "spacer_ring": {
      const spacer = source?.type === "spacer" ? source : undefined;
      const spacerPartName = `spacer_air_gap_${safeFileName(sourceName || "ring")}`;
      return {
        type: "spacer_ring",
        params: {
          partName: spacerPartName,
          innerDiameterMm: spacer?.innerDiameterMm ?? defaults.defaultInnerDiameterMm,
          outerDiameterMm: spacer?.outerDiameterMm ?? defaults.defaultOuterDiameterMm,
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
      const recommendedInner = getRecommendedBarrelInnerDiameter(project.stackItems, defaults);
      const mainBarrelInner = Math.max(
        plMainBarrelInnerDefault,
        Number(recommendedInner.toFixed(3))
      );
      const mainBarrelOuter = Math.max(
        plMainBarrelOuterDefault,
        Number((mainBarrelInner + defaults.wallThicknessMm * 2).toFixed(3))
      );
      const pinDiameter = plPinDiameter;
      const pinClearance = plPinClearance;
      const slotWidth = Number((pinDiameter + pinClearance).toFixed(3));
      const slotLength = Number(
        (
          (focusDerived.recommendedPrototypeTravelMm ?? plSlotLengthManual) + 2
        ).toFixed(3)
      );
      const stepUpStart = Math.max(
        plLockClearanceLength,
        plStepUpStart
      );
      const mainBarrelLength = Math.max(
        plMainBarrelLengthDefault,
        estimateMainBarrelLengthMm(project, source)
      );
      const totalLength = Number((stepUpStart + mainBarrelLength).toFixed(3));
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
        0,
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
          plLockingClearanceLengthMm: plLockClearanceLength,
          plLockingClearanceDiameterMm: plLockClearanceDiameter,
          stepUpStartFromPLFlangeMm: stepUpStart,
          slotCount: plSlotCount,
          slotAngleOffsetDeg: plSlotAngleOffset,
          slotLengthMm: Math.max(slotLength, 6),
          slotWidthMm: slotWidth,
          slotStartZMm: plSlotStartZ,
          pinDiameterMm: pinDiameter,
          pinClearanceMm: pinClearance,
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
      const largestGlassDiameter = getLargestGlassDiameter(project.stackItems);
      const fixedInner = Math.max(
        plMainBarrelInnerDefault,
        getRecommendedBarrelInnerDiameter(project.stackItems, defaults)
      );
      const carrierOuter = Number(
        Math.max(
          largestGlassDiameter + defaults.radialClearanceMm * 2 + 0.8,
          fixedInner - (defaults.printToleranceMm + defaults.radialClearanceMm + 0.15) * 2
        ).toFixed(3)
      );
      const carrierInner = Number(
        Math.max(
          largestGlassDiameter + defaults.radialClearanceMm * 2 + 0.4,
          defaults.defaultInnerDiameterMm - 2
        ).toFixed(3)
      );
      const focusTravelMm =
        focusDerived.recommendedPrototypeTravelMm ?? plSlotLengthManual;
      const carrierLength = Number(Math.max(18, Math.min(focusTravelMm * 0.72, 52)).toFixed(3));
      const pinHoleDiameter = Number((Math.max(1.5, plPinDiameter) + 0.1).toFixed(3));
      const pinBossDiameter = Number((pinHoleDiameter + 3).toFixed(3));
      const pinHoleZ = Number((carrierLength * 0.5).toFixed(3));
      return {
        type: "sliding_optical_carrier",
        params: {
          partName,
          innerDiameterMm: Math.min(carrierInner, carrierOuter - 0.8),
          outerDiameterMm: Math.max(carrierOuter, carrierInner + 0.8),
          lengthMm: carrierLength,
          startZMm: 0,
          pinHoleCount: plSlotCount,
          pinHoleAngleOffsetDeg: plSlotAngleOffset,
          pinHoleDiameterMm: pinHoleDiameter,
          pinHoleZMm: pinHoleZ,
          addPinBosses: true,
          pinBossDiameterMm: pinBossDiameter,
          pinBossHeightMm: 2,
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
  const [fixedPlBarrelAttachZMm, setFixedPlBarrelAttachZMm] = useState<number>(
    project.cadDefaults.plBarrelAttachZMm ?? 0.0
  );
  const [fixedPlOverlapMm, setFixedPlOverlapMm] = useState<number>(
    project.cadDefaults.plReferenceOverlapMm ?? 2.0
  );
  const plAssemblyIncludeMain = project.cadDefaults.plAssemblyIncludeMainBarrelSection ?? true;
  const plAssemblyIncludeCarrier = project.cadDefaults.plAssemblyIncludeMovingCarrier ?? true;
  const plAssemblyIncludePins = project.cadDefaults.plAssemblyIncludeGuidePins ?? true;
  const plAssemblyFuse = project.cadDefaults.plAssemblyFuseBarrelToPl ?? false;
  const plStepReferencePath = resolvePlStepPath(project.cadDefaults.plStepReferencePath);

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
    setFixedPlOverlapMm(project.cadDefaults.plReferenceOverlapMm ?? 2.0);
  }, [project.cadDefaults.plBarrelAttachZMm, project.cadDefaults.plReferenceOverlapMm]);

  const sourceItem = sourceCandidates.find((item) => item.id === sourceItemId);
  const fixedPlOverrides =
    partType === "fixed_pl_barrel_with_slots"
      ? {
          barrelAttachZMm: fixedPlBarrelAttachZMm,
          plOverlapMm: fixedPlOverlapMm
        }
      : undefined;
  const payload = createPayload(project, partType, sourceItem, fixedPlOverrides);
  const slidingCarrierPayloadForAssembly = createPayload(
    project,
    "sliding_optical_carrier",
    sourceItem
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
        const focus = getFocusTravelDerived(project);
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
            focusPrototypeStartMm: focus.prototypeStartMm,
            recommendedPrototypeTravelMm: focus.recommendedPrototypeTravelMm,
            targetMountThroatDiameterMm: focus.targetMountThroatDiameterMm
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
          "For exact STEP alignment + full assembly workflow, use FreeCAD Assembly Macro with PL STEP."
        ]
      : [])
  ];
  const partWarnings = sourceItem ? getPartWarnings(sourceItem, project.cadDefaults) : [];

  const specs = useMemo(() => {
    const values: Record<string, string | number | boolean> = {
      part_name: payload.params.partName
    };

    if (payload.type === "element_cup") {
      values.glass_diameter = `${pretty(payload.params.glassDiameterMm)} mm`;
      values.glass_thickness = `${pretty(payload.params.glassThicknessMm)} mm`;
      values.seat_clearance = `${pretty(payload.params.seatClearanceMm)} mm`;
      values.wall_thickness = `${pretty(payload.params.wallThicknessMm)} mm`;
      values.outer_diameter = `${pretty(payload.params.outerDiameterMm ?? 0)} mm`;
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
      values.main_barrel_length = `${pretty(payload.params.mainBarrelLengthMm)} mm`;
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
      values.inner_diameter = `${pretty(payload.params.innerDiameterMm)} mm`;
      values.outer_diameter = `${pretty(payload.params.outerDiameterMm)} mm`;
      values.length = `${pretty(payload.params.lengthMm)} mm`;
      values.pin_hole_count = payload.params.pinHoleCount;
      values.pin_hole_diameter = `${pretty(payload.params.pinHoleDiameterMm)} mm`;
      values.pin_hole_z = `${pretty(payload.params.pinHoleZMm)} mm`;
      values.pin_bosses = payload.params.addPinBosses;
      return values;
    }

    values.inner_diameter = `${pretty(payload.params.innerDiameterMm)} mm`;
    values.outer_diameter = `${pretty(payload.params.outerDiameterMm)} mm`;
    values.length = `${pretty(payload.params.lengthMm)} mm`;
    values.rotation_degrees = payload.params.rotationDegrees;
    values.axial_travel = `${pretty(payload.params.axialTravelMm)} mm`;
    return values;
  }, [payload]);

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
              min={0}
              step={0.1}
              onChange={(event) =>
                setFixedPlOverlapMm(
                  Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : 0
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
