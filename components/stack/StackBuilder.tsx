"use client";

import { useEffect, useMemo, useState } from "react";
import { getRecommendedBarrelInnerDiameter, getTotalStackLength } from "@/lib/calculations";
import {
  calculateAirspaceInsertLayouts,
  createDefaultAirspaceInsertedItem,
  getAirspaceInsertedItemsTotalThicknessMm,
  normalizeAirspaceInsertedItems
} from "@/lib/airspaceInserts";
import { createId } from "@/lib/ids";
import { defaultOpticalTypeByStackType, getItemOpticalType, opticalTypeOptions } from "@/lib/stackMeta";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { NumberInput } from "@/components/common/NumberInput";
import { Select } from "@/components/common/Select";
import { WarningBox } from "@/components/common/WarningBox";
import { AddStackItemModal } from "@/components/stack/AddStackItemModal";
import { StackItemCard } from "@/components/stack/StackItemCard";
import { StackPreview2D } from "@/components/stack/StackPreview2D";
import { StackSummary } from "@/components/stack/StackSummary";
import type {
  AdvancedGlassProfile,
  AdvancedGlassProfileSection,
  CadDefaults,
  GlassProfileSegment,
  LensProject,
  MechanicalPart,
  OpticalItemType,
  AirspaceInsertedItem,
  StackItem,
  StackItemType,
  StepDirection
} from "@/types";

const stepDirectionOptions: Array<{ value: StepDirection; label: string }> = [
  { value: "large_side_front", label: "Large side faces front" },
  { value: "large_side_rear", label: "Large side faces rear" },
  { value: "unknown", label: "Unknown" }
];

type SpacerDiameterMode = "match_lens_cups" | "match_carrier" | "manual";

const spacerDiameterModeOptions: Array<{ value: SpacerDiameterMode; label: string }> = [
  { value: "match_lens_cups", label: "Match lens cups" },
  { value: "manual", label: "Manual" }
];

const thicknessMeasurementTypeOptions: Array<{
  value:
    | "edge_thickness"
    | "center_max_thickness"
    | "straight_body_thickness"
    | "mechanical_block_length"
    | "estimated"
    | "unknown";
  label: string;
}> = [
  { value: "edge_thickness", label: "Edge thickness" },
  { value: "center_max_thickness", label: "Center/max thickness" },
  { value: "straight_body_thickness", label: "Straight body thickness" },
  { value: "mechanical_block_length", label: "Mechanical block length" },
  { value: "estimated", label: "Estimated" },
  { value: "unknown", label: "Unknown" }
];

const measurementConfidenceOptions: Array<{ value: "measured" | "estimated" | "unknown"; label: string }> = [
  { value: "measured", label: "Measured" },
  { value: "estimated", label: "Estimated" },
  { value: "unknown", label: "Unknown" }
];

const cupInsertionSideOptions: Array<{ value: "auto" | "front" | "rear"; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "front", label: "Front" },
  { value: "rear", label: "Rear" }
];

const cupRetainingSideOptions: Array<{
  value: "auto" | "front" | "rear" | "both" | "none";
  label: string;
}> = [
  { value: "auto", label: "Auto" },
  { value: "front", label: "Front" },
  { value: "rear", label: "Rear" },
  { value: "both", label: "Both" },
  { value: "none", label: "None" }
];

const spacerThicknessSourceOptions: Array<{
  value: "same_as_airspace" | "calculated_from_cup_offsets" | "manual_override";
  label: string;
}> = [
  { value: "same_as_airspace", label: "Same as optical airspace" },
  { value: "calculated_from_cup_offsets", label: "Calculated from cup offsets" },
  { value: "manual_override", label: "Manual override" }
];

const airspaceMeasurementTypeOptions: Array<{
  value:
    | "optical_surface_to_optical_surface"
    | "mechanical_edge_or_seat_to_edge_or_seat"
    | "cad_face_to_cad_face"
    | "physical_caliper_estimate"
    | "estimated"
    | "unknown";
  label: string;
}> = [
  { value: "optical_surface_to_optical_surface", label: "Optical surface to optical surface" },
  { value: "mechanical_edge_or_seat_to_edge_or_seat", label: "Mechanical edge/seat to edge/seat" },
  { value: "cad_face_to_cad_face", label: "CAD face to CAD face" },
  { value: "physical_caliper_estimate", label: "Physical caliper estimate" },
  { value: "estimated", label: "Estimated" },
  { value: "unknown", label: "Unknown" }
];

const airspaceInsertedPositionModeOptions: Array<{
  value: "centered" | "distance_from_front" | "distance_from_rear" | "manual_split";
  label: string;
}> = [
  { value: "centered", label: "Centered" },
  { value: "distance_from_front", label: "Distance from front" },
  { value: "distance_from_rear", label: "Distance from rear" },
  { value: "manual_split", label: "Manual split" }
];

const DEFAULT_CUP_TO_CARRIER_CLEARANCE_MM = 0.6;
const DEFAULT_MIN_CUP_WALL_THICKNESS_MM = 2.0;
const DEFAULT_SHARED_STACK_ROUNDING_INCREMENT_MM = 0.5;
const DEFAULT_CARRIER_WALL_THICKNESS_MM = 2.0;
const DEFAULT_CARRIER_TO_BARREL_CLEARANCE_MM = 0.8;
const DEFAULT_FIXED_BARREL_WALL_THICKNESS_MM = 2.0;

function roundUpToIncrement(value: number, increment: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(increment) || increment <= 0) return value;
  return Math.ceil(value / increment) * increment;
}

function normalizePositions(items: StackItem[]): StackItem[] {
  return items.map((item, index) => ({ ...item, positionIndex: index }));
}

function normalizeMechanicalParts(parts: MechanicalPart[]): MechanicalPart[] {
  return parts.map((part) => ({
    ...part,
    surroundsStack: part.surroundsStack ?? part.type !== "mount_reference",
    contributesToOpticalStackLength: part.contributesToOpticalStackLength ?? false
  }));
}

function createStackItem(type: StackItemType, index: number): StackItem {
  const id = createId(type);
  const opticalType = defaultOpticalTypeByStackType[type];
  switch (type) {
    case "glass":
      return {
        id,
        name: "New glass",
        type,
        opticalType,
        positionIndex: index,
        diameterMm: 30,
        thicknessMm: 4,
        thicknessMeasurementType: "unknown",
        thicknessConfidence: "unknown",
        hasSteppedProfile: false,
        stepDirection: "unknown",
        advancedProfile: {
          enabled: false,
          totalLengthMm: 4,
          maxDiameterMm: 30,
          maxDiameterPositionFromFrontMm: 0,
          sections: []
        },
        advancedProfileEnabled: false,
        profileSegments: [],
        flipped: false,
        cupInsertionSide: "auto",
        cupRetainingSide: "auto",
        retainingLipEnabled: true,
        retainingLipThicknessMm: 1.2
      };
    case "spacer": {
      const desiredOpticalAirGapMm = 1;
      return {
        id,
        name: "New spacer / air gap ring",
        type,
        opticalType,
        positionIndex: index,
        innerDiameterMm: 28,
        outerDiameterMm: 38,
        thicknessMm: desiredOpticalAirGapMm,
        desiredOpticalAirGapMm,
        physicalSpacerThicknessMm: desiredOpticalAirGapMm,
        physicalSpacerThicknessSource: "same_as_airspace",
        airspaceMeasurementType: "unknown",
        airspaceConfidence: "unknown",
        insertedItems: [],
        insertedItemsTotalThicknessMm: 0,
        autoFitToBarrel: true,
        spacerDiameterMode: "match_lens_cups",
        hasAntiReflectionGrooves: false,
        chamferEnabled: false,
        chamferMm: 0.2
      };
    }
    case "iris":
      return {
        id,
        name: "New iris",
        type,
        opticalType,
        positionIndex: index,
        diskDiameterMm: 30,
        apertureDiameterMm: 14,
        thicknessMm: 1.2,
        isOval: false
      };
    case "diffusion":
      return {
        id,
        name: "New diffusion",
        type,
        opticalType,
        positionIndex: index,
        diskDiameterMm: 30,
        clearCenterDiameterMm: 12,
        diffusionOuterDiameterMm: 24,
        thicknessMm: 1
      };
    case "mount":
      return {
        id,
        name: "New mount",
        type,
        opticalType,
        positionIndex: index,
        mountType: "PL",
        flangeDistanceMm: 52,
        innerClearanceMm: 40
      };
    case "barrel":
      return {
        id,
        name: "New barrel",
        type,
        opticalType,
        positionIndex: index,
        innerDiameterMm: 40,
        outerDiameterMm: 44,
        lengthMm: 40,
        autoFitToStack: true,
        screwHoleCount: 0
      };
    case "retaining_ring":
      return {
        id,
        name: "New retaining ring",
        type,
        opticalType,
        positionIndex: index,
        innerDiameterMm: 30,
        outerDiameterMm: 34,
        thicknessMm: 1.5,
        autoFitToBarrel: true,
        notchCount: 2
      };
    case "custom":
      return {
        id,
        name: "New custom item",
        type,
        opticalType,
        positionIndex: index,
        lengthMm: 0
      };
  }
}

function createMechanicalPart(type: MechanicalPart["type"]): MechanicalPart {
  const id = createId("mech");
  switch (type) {
    case "barrel":
      return {
        id,
        type,
        name: "Barrel",
        innerDiameterMm: 40,
        outerDiameterMm: 44,
        lengthMm: 40,
        surroundsStack: true,
        contributesToOpticalStackLength: false
      };
    case "fixed_pl_barrel":
      return {
        id,
        type,
        name: "Fixed PL barrel",
        innerDiameterMm: 39,
        outerDiameterMm: 44,
        lengthMm: 50,
        surroundsStack: true,
        contributesToOpticalStackLength: false
      };
    case "sliding_optical_carrier":
      return {
        id,
        type,
        name: "Sliding optical carrier",
        innerDiameterMm: 35,
        outerDiameterMm: 38.5,
        lengthMm: 30,
        surroundsStack: true,
        contributesToOpticalStackLength: false
      };
    case "main_barrel":
      return {
        id,
        type,
        name: "Main barrel section",
        innerDiameterMm: 40,
        outerDiameterMm: 44,
        lengthMm: 50,
        surroundsStack: true,
        contributesToOpticalStackLength: false
      };
    case "moving_carrier":
      return {
        id,
        type,
        name: "Moving carrier (legacy)",
        innerDiameterMm: 34,
        outerDiameterMm: 38,
        lengthMm: 24,
        surroundsStack: true,
        contributesToOpticalStackLength: false
      };
    case "cam_sleeve":
      return {
        id,
        type,
        name: "Cam sleeve (TODO)",
        innerDiameterMm: 40,
        outerDiameterMm: 44,
        lengthMm: 45,
        surroundsStack: true,
        contributesToOpticalStackLength: false
      };
    case "mount_reference":
      return {
        id,
        type,
        name: "Mount reference",
        surroundsStack: false,
        contributesToOpticalStackLength: false
      };
    case "custom_mechanical":
      return {
        id,
        type,
        name: "Custom mechanical part",
        surroundsStack: true,
        contributesToOpticalStackLength: false
      };
    default:
      return {
        id,
        type: "custom_mechanical",
        name: "Custom mechanical part",
        surroundsStack: true,
        contributesToOpticalStackLength: false
      };
  }
}

function toPositive(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

function sanitizeSegmentValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function getGlassProfileDepth(segments: GlassProfileSegment[] | undefined): number {
  if (!segments?.length) return 0;
  return segments.reduce((sum, segment) => sum + toPositive(segment.depthMm), 0);
}

function getGlassProfileMaxDiameter(segments: GlassProfileSegment[] | undefined): number {
  if (!segments?.length) return 0;
  return segments.reduce((max, segment) => Math.max(max, toPositive(segment.diameterMm)), 0);
}

function normalizeAdvancedSections(sections: AdvancedGlassProfileSection[]): AdvancedGlassProfileSection[] {
  return sections.map((section, index) => ({ ...section, index }));
}

function createDefaultAdvancedProfile(glass: Extract<StackItem, { type: "glass" }>): AdvancedGlassProfile {
  return {
    enabled: false,
    totalLengthMm: Number(Math.max(0, glass.thicknessMm).toFixed(2)),
    maxDiameterMm: Number(Math.max(0, glass.diameterMm).toFixed(2)),
    maxDiameterPositionFromFrontMm: 0,
    sections: []
  };
}

function advancedSectionsToLegacySegments(sections: AdvancedGlassProfileSection[]): GlassProfileSegment[] {
  return normalizeAdvancedSections(sections).map((section, index) => ({
    id: section.id,
    name: section.label || `Segment ${index + 1}`,
    diameterMm: section.diameterMm,
    depthMm: section.lengthMm
  }));
}

function legacySegmentsToAdvancedSections(segments: GlassProfileSegment[]): AdvancedGlassProfileSection[] {
  return segments.map((segment, index) => ({
    id: segment.id,
    index,
    label: segment.name,
    diameterMm: segment.diameterMm,
    lengthMm: segment.depthMm
  }));
}

function getEffectiveAdvancedProfile(glass: Extract<StackItem, { type: "glass" }>): AdvancedGlassProfile {
  if (glass.advancedProfile) {
    return {
      ...glass.advancedProfile,
      sections: normalizeAdvancedSections(glass.advancedProfile.sections ?? [])
    };
  }

  const legacySections = legacySegmentsToAdvancedSections(glass.profileSegments ?? []);
  return {
    enabled: Boolean(glass.advancedProfileEnabled),
    totalLengthMm: Number((getGlassProfileDepth(glass.profileSegments) || glass.thicknessMm || 0).toFixed(2)),
    maxDiameterMm: Number((getGlassProfileMaxDiameter(glass.profileSegments) || glass.diameterMm || 0).toFixed(2)),
    maxDiameterPositionFromFrontMm: 0,
    sections: normalizeAdvancedSections(legacySections)
  };
}

function getAdvancedProfileSectionSum(profile: AdvancedGlassProfile | undefined): number {
  if (!profile?.sections?.length) return 0;
  return profile.sections.reduce((sum, section) => sum + toPositive(section.lengthMm), 0);
}

function getAdvancedProfileWarnings(profile: AdvancedGlassProfile | undefined): string[] {
  if (!profile?.enabled) return [];
  const warnings: string[] = [];
  const sections = profile.sections ?? [];
  const sectionSum = getAdvancedProfileSectionSum(profile);
  const differenceAbs = Math.abs(profile.totalLengthMm - sectionSum);

  if (sections.length === 0) {
    warnings.push("Advanced physical profile is enabled but no sections are defined.");
  }
  if (sections.some((section) => toPositive(section.diameterMm) <= 0 || toPositive(section.lengthMm) <= 0)) {
    warnings.push("Advanced physical profile has a section missing diameter or length.");
  }
  if (differenceAbs > 2) {
    warnings.push("Advanced physical profile section sum differs from total length by more than 2.0 mm.");
  } else if (differenceAbs > 1) {
    warnings.push("Advanced physical profile section sum differs from total length by more than 1.0 mm.");
  }
  if (
    toPositive(profile.maxDiameterMm) > 0 &&
    sections.some((section) => toPositive(section.diameterMm) > toPositive(profile.maxDiameterMm))
  ) {
    warnings.push("Advanced physical profile max diameter is smaller than a section diameter.");
  }

  return warnings;
}

function syncAdvancedGlassProfiles(items: StackItem[]): StackItem[] {
  return items.map((item) => {
    if (item.type !== "glass") return item;
    const profile = getEffectiveAdvancedProfile(item);
    const legacyEnabled = item.advancedProfileEnabled ?? profile.enabled;
    if (!legacyEnabled && !profile.enabled) return item;
    const sourceSegments = profile.enabled
      ? advancedSectionsToLegacySegments(profile.sections ?? []).filter(
          (section) => toPositive(section.diameterMm) > 0 && toPositive(section.depthMm) > 0
        )
      : item.profileSegments ?? [];
    if (!sourceSegments.length) return item;

    const profileDepth = getGlassProfileDepth(sourceSegments);
    const profileMaxDiameter = getGlassProfileMaxDiameter(sourceSegments);

    return {
      ...item,
      advancedProfile: {
        ...profile,
        sections: normalizeAdvancedSections(profile.sections ?? [])
      },
      advancedProfileEnabled: profile.enabled,
      profileSegments: sourceSegments,
      thicknessMm: profileDepth > 0 ? Number(profileDepth.toFixed(3)) : item.thicknessMm,
      diameterMm: profileMaxDiameter > 0 ? Number(profileMaxDiameter.toFixed(3)) : item.diameterMm
    };
  });
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

function getReferenceBarrelInnerDiameter(
  items: StackItem[],
  mechanicalParts: MechanicalPart[],
  defaults: CadDefaults
): number {
  const priority: MechanicalPart["type"][] = ["fixed_pl_barrel", "main_barrel", "barrel"];
  for (const type of priority) {
    const match = mechanicalParts.find(
      (part) => part.type === type && toPositive(part.innerDiameterMm) > 0
    );
    if (match) return toPositive(match.innerDiameterMm);
  }

  const any = mechanicalParts.find((part) => toPositive(part.innerDiameterMm) > 0);
  if (any) return toPositive(any.innerDiameterMm);
  return getRecommendedBarrelInnerDiameter(items, defaults);
}

function getLargestGlassMaxDiameter(items: StackItem[]): number {
  return items.reduce((max, item) => Math.max(max, getGlassMaxDiameterForCup(item)), 0);
}

function getTargetStackOuterDiameter(
  items: StackItem[],
  _mechanicalParts: MechanicalPart[],
  defaults: CadDefaults
): number {
  const manual = toPositive(defaults.targetStackOuterDiameterMm);
  if (manual > 0) return manual;

  const largestGlass = getLargestGlassMaxDiameter(items);
  if (largestGlass > 0) {
    const rawTarget = largestGlass + DEFAULT_MIN_CUP_WALL_THICKNESS_MM * 2;
    return Math.max(4, roundUpToIncrement(rawTarget, DEFAULT_SHARED_STACK_ROUNDING_INCREMENT_MM));
  }

  return Math.max(4, toPositive(defaults.defaultOuterDiameterMm));
}

function getSpacerDiameterMode(item: Extract<StackItem, { type: "spacer" }>): SpacerDiameterMode {
  if (
    item.spacerDiameterMode === "match_lens_cups" ||
    item.spacerDiameterMode === "manual"
  ) {
    return item.spacerDiameterMode;
  }
  if (item.spacerDiameterMode === "match_carrier") return "match_lens_cups";
  return item.autoFitToBarrel === false ? "manual" : "match_lens_cups";
}

function getSpacerDesiredOpticalAirGapMm(item: Extract<StackItem, { type: "spacer" }>): number {
  const desired = toPositive(item.desiredOpticalAirGapMm);
  if (desired > 0) return desired;
  const fallback = toPositive(item.thicknessMm);
  return fallback > 0 ? fallback : 0;
}

function getSpacerPhysicalThicknessMm(item: Extract<StackItem, { type: "spacer" }>): number {
  const physical = toPositive(item.physicalSpacerThicknessMm);
  if (physical > 0) return physical;
  return getSpacerDesiredOpticalAirGapMm(item);
}

function getSpacerThicknessSource(
  item: Extract<StackItem, { type: "spacer" }>
): "same_as_airspace" | "calculated_from_cup_offsets" | "manual_override" {
  return item.physicalSpacerThicknessSource === "calculated_from_cup_offsets" ||
    item.physicalSpacerThicknessSource === "manual_override"
    ? item.physicalSpacerThicknessSource
    : "same_as_airspace";
}

function getGlassMaxDiameterForCup(item?: StackItem): number {
  if (!item || item.type !== "glass") return 0;

  const candidates: number[] = [toPositive(item.diameterMm)];
  if (item.hasSteppedProfile) {
    candidates.push(toPositive(item.largeDiameterMm), toPositive(item.smallDiameterMm));
  }
  if (item.advancedProfile?.enabled) {
    candidates.push(toPositive(item.advancedProfile.maxDiameterMm));
    (item.advancedProfile.sections ?? []).forEach((section) => {
      candidates.push(toPositive(section.diameterMm));
    });
  }
  if (item.advancedProfileEnabled) {
    (item.profileSegments ?? []).forEach((segment) => {
      candidates.push(toPositive(segment.diameterMm));
    });
  }

  return Math.max(0, ...candidates);
}

function deriveSpacerRingDimensions(
  items: StackItem[],
  mechanicalParts: MechanicalPart[],
  defaults: CadDefaults,
  index: number,
  spacer: Extract<StackItem, { type: "spacer" }>
): {
  innerDiameterMm: number;
  outerDiameterMm: number;
} {
  const mode = getSpacerDiameterMode(spacer);
  const targetStackOuterDiameterMm = getTargetStackOuterDiameter(items, mechanicalParts, defaults);
  const nearbyAperture = getNearbyAperture(items, index);
  const defaultInnerFromAperture = nearbyAperture > 0 ? nearbyAperture + 2.0 : 30.0;
  const minimumWallWidth = 0.8;
  const manualInner = toPositive(spacer.manualInnerDiameterMm) || toPositive(spacer.innerDiameterMm);

  const outerDiameterMm = Math.max(10, targetStackOuterDiameterMm);

  const innerCandidate = mode === "manual" ? manualInner : defaultInnerFromAperture;
  const hardMaximumInner = outerDiameterMm - minimumWallWidth * 2;

  const innerDiameterMm = Math.max(
    4,
    Math.min(hardMaximumInner, innerCandidate > 0 ? innerCandidate : defaultInnerFromAperture)
  );

  return {
    innerDiameterMm: Number(innerDiameterMm.toFixed(2)),
    outerDiameterMm: Number(outerDiameterMm.toFixed(2))
  };
}

function deriveBarrelDimensionsFromStack(items: StackItem[], defaults: CadDefaults): {
  innerDiameterMm: number;
  outerDiameterMm: number;
} {
  const innerDiameterMm = Number(getRecommendedBarrelInnerDiameter(items, defaults).toFixed(2));
  const outerDiameterMm = Number((innerDiameterMm + defaults.wallThicknessMm * 2).toFixed(2));
  return {
    innerDiameterMm,
    outerDiameterMm
  };
}

function isAutoFitBarrel(item: Extract<StackItem, { type: "barrel" }>): boolean {
  return item.autoFitToStack !== false;
}

function applyAutoFitBarrelDimensions(items: StackItem[], defaults: CadDefaults): StackItem[] {
  return items.map((item) => {
    if (item.type !== "barrel" || !isAutoFitBarrel(item)) return item;
    const auto = deriveBarrelDimensionsFromStack(items, defaults);
    return { ...item, ...auto };
  });
}

function deriveRetainingRingDimensions(
  items: StackItem[],
  mechanicalParts: MechanicalPart[],
  defaults: CadDefaults,
  index: number
): {
  innerDiameterMm: number;
  outerDiameterMm: number;
} {
  const barrelInner = getReferenceBarrelInnerDiameter(items, mechanicalParts, defaults);
  const fitClearancePerSide = Math.max(defaults.radialClearanceMm + defaults.printToleranceMm, 0.25);
  const outerDiameterMm = Math.max(10, barrelInner - fitClearancePerSide * 2);
  const innerDiameterMm = Math.max(4, outerDiameterMm - 2.4);
  return {
    innerDiameterMm: Number(innerDiameterMm.toFixed(2)),
    outerDiameterMm: Number(outerDiameterMm.toFixed(2))
  };
}

function isAutoFitRetainingRing(item: Extract<StackItem, { type: "retaining_ring" }>): boolean {
  return item.autoFitToBarrel !== false;
}

function applyAutoFitRetainingRingDimensions(
  items: StackItem[],
  mechanicalParts: MechanicalPart[],
  defaults: CadDefaults
): StackItem[] {
  return items.map((item, index) => {
    if (item.type !== "retaining_ring" || !isAutoFitRetainingRing(item)) return item;
    const auto = deriveRetainingRingDimensions(items, mechanicalParts, defaults, index);
    return { ...item, ...auto };
  });
}

function applyAutoFitSpacerDimensions(
  items: StackItem[],
  mechanicalParts: MechanicalPart[],
  defaults: CadDefaults
): StackItem[] {
  return items.map((item, index) => {
    if (item.type !== "spacer") return item;
    const auto = deriveSpacerRingDimensions(items, mechanicalParts, defaults, index, item);
    const desiredOpticalAirGapMm = getSpacerDesiredOpticalAirGapMm(item);
    const physicalSpacerThicknessMm = getSpacerPhysicalThicknessMm(item);
    const insertedItems = normalizeAirspaceInsertedItems(item.insertedItems);
    const insertedItemsTotalThicknessMm = getAirspaceInsertedItemsTotalThicknessMm(insertedItems);
    return {
      ...item,
      ...auto,
      thicknessMm: physicalSpacerThicknessMm,
      desiredOpticalAirGapMm,
      physicalSpacerThicknessMm,
      physicalSpacerThicknessSource: getSpacerThicknessSource(item),
      airspaceMeasurementType: item.airspaceMeasurementType ?? "unknown",
      airspaceConfidence: item.airspaceConfidence ?? "unknown",
      insertedItems,
      insertedItemsTotalThicknessMm: Number(insertedItemsTotalThicknessMm.toFixed(3))
    };
  });
}

function validateItem(item: StackItem): string[] {
  const errors: string[] = [];
  if (!item.name.trim()) errors.push("Stack item name is required.");

  const invalid = (value: number | undefined) => typeof value !== "number" || !Number.isFinite(value) || value <= 0;

  switch (item.type) {
    case "glass":
      if (invalid(item.diameterMm)) errors.push("Glass diameter must be positive.");
      if (invalid(item.thicknessMm)) errors.push("Glass thickness must be positive.");
      if (item.hasSteppedProfile) {
        if (invalid(item.largeDiameterMm)) errors.push("Stepped profile large diameter must be positive.");
        if (invalid(item.smallDiameterMm)) errors.push("Stepped profile small diameter must be positive.");
        if (invalid(item.largeSectionThicknessMm)) {
          errors.push("Stepped profile large section thickness must be positive.");
        }
        if (invalid(item.smallSectionThicknessMm)) {
          errors.push("Stepped profile small section thickness must be positive.");
        }
        if (item.stepDirection === undefined) {
          errors.push("Stepped profile step direction is required.");
        }
      }
      break;
    case "spacer":
      if (invalid(item.innerDiameterMm) || invalid(item.outerDiameterMm)) {
        errors.push("Spacer / Air Gap Ring dimensions must be positive.");
      }
      if (getSpacerDesiredOpticalAirGapMm(item) <= 0) {
        errors.push("Desired optical air gap must be positive.");
      }
      if (getSpacerPhysicalThicknessMm(item) <= 0) {
        errors.push("Printed spacer thickness must be positive.");
      }
      if (item.innerDiameterMm >= item.outerDiameterMm) {
        errors.push("Spacer / Air Gap Ring inner diameter must be smaller than outer.");
      }
      if (item.chamferEnabled && invalid(item.chamferMm)) {
        errors.push("Chamfer must be positive when enabled.");
      }
      const insertedLayouts = calculateAirspaceInsertLayouts(
        getSpacerDesiredOpticalAirGapMm(item),
        item.insertedItems
      );
      insertedLayouts.forEach((layout) => {
        layout.warnings.forEach((warning) => {
          errors.push(`${layout.item.label}: ${warning}`);
        });
      });
      break;
    case "iris":
      if (invalid(item.diskDiameterMm) || invalid(item.apertureDiameterMm) || invalid(item.thicknessMm)) {
        errors.push("Iris dimensions must be positive.");
      }
      if (item.apertureDiameterMm > item.diskDiameterMm) errors.push("Aperture cannot be larger than disk diameter.");
      break;
    case "diffusion":
      if (
        invalid(item.diskDiameterMm) ||
        invalid(item.clearCenterDiameterMm) ||
        invalid(item.diffusionOuterDiameterMm) ||
        invalid(item.thicknessMm)
      ) {
        errors.push("Diffusion dimensions must be positive.");
      }
      if (item.clearCenterDiameterMm > item.diffusionOuterDiameterMm) {
        errors.push("Clear center cannot be larger than diffusion outer diameter.");
      }
      break;
    case "barrel":
      if (invalid(item.innerDiameterMm) || invalid(item.outerDiameterMm) || invalid(item.lengthMm)) {
        errors.push("Barrel dimensions must be positive.");
      }
      if (item.innerDiameterMm >= item.outerDiameterMm) errors.push("Inner diameter must be smaller than outer diameter.");
      break;
    case "retaining_ring":
      if (invalid(item.innerDiameterMm) || invalid(item.outerDiameterMm) || invalid(item.thicknessMm)) {
        errors.push("Retaining ring dimensions must be positive.");
      }
      if (item.innerDiameterMm >= item.outerDiameterMm) errors.push("Inner diameter must be smaller than outer diameter.");
      break;
    case "custom":
      if (item.lengthMm !== undefined && item.lengthMm < 0) errors.push("Custom length cannot be negative.");
      break;
    default:
      break;
  }

  return errors;
}

export function StackBuilder({
  project,
  onProjectChange
}: {
  project: LensProject;
  onProjectChange: (project: LensProject) => void;
}) {
  const orderedItems = useMemo(() => normalizePositions(project.stackItems), [project.stackItems]);
  const mechanicalParts = useMemo(
    () => normalizeMechanicalParts(project.mechanicalParts ?? []),
    [project.mechanicalParts]
  );
  const [selectedId, setSelectedId] = useState<string | undefined>(orderedItems[0]?.id);
  const [draftInsertedItemsBySpacer, setDraftInsertedItemsBySpacer] = useState<
    Record<string, AirspaceInsertedItem[]>
  >({});
  const [insertApplyStatusBySpacer, setInsertApplyStatusBySpacer] = useState<Record<string, string>>({});

  const selectedItem = orderedItems.find((item) => item.id === selectedId) ?? orderedItems[0];
  const selectedErrors = selectedItem ? validateItem(selectedItem) : [];
  const selectedGlass = selectedItem?.type === "glass" ? selectedItem : undefined;
  const selectedSpacer = selectedItem?.type === "spacer" ? selectedItem : undefined;
  const selectedAdvancedProfile = selectedGlass ? getEffectiveAdvancedProfile(selectedGlass) : undefined;
  const selectedAdvancedSections = normalizeAdvancedSections(selectedAdvancedProfile?.sections ?? []);
  const selectedAdvancedSectionSum = getAdvancedProfileSectionSum(selectedAdvancedProfile);
  const selectedAdvancedLengthDifference = (selectedAdvancedProfile?.totalLengthMm ?? 0) - selectedAdvancedSectionSum;
  const selectedAdvancedLengthDifferenceAbs = Math.abs(selectedAdvancedLengthDifference);
  const selectedAdvancedWarnings = getAdvancedProfileWarnings(selectedAdvancedProfile);
  const selectedSpacerDesiredOpticalAirGapMm = selectedSpacer
    ? getSpacerDesiredOpticalAirGapMm(selectedSpacer)
    : 0;
  const selectedSpacerPhysicalThicknessMm = selectedSpacer
    ? getSpacerPhysicalThicknessMm(selectedSpacer)
    : 0;
  const selectedSpacerThicknessSource = selectedSpacer
    ? getSpacerThicknessSource(selectedSpacer)
    : "same_as_airspace";
  const targetStackOuterDiameterMm = getTargetStackOuterDiameter(
    orderedItems,
    mechanicalParts,
    project.cadDefaults
  );
  const selectedSpacerIndex = selectedSpacer
    ? orderedItems.findIndex((entry) => entry.id === selectedSpacer.id)
    : -1;
  const selectedSpacerNearbyApertureMm =
    selectedSpacerIndex >= 0 ? getNearbyAperture(orderedItems, selectedSpacerIndex) : 0;
  const selectedSpacerWorkingInsertedItems = selectedSpacer
    ? normalizeAirspaceInsertedItems(
        draftInsertedItemsBySpacer[selectedSpacer.id] ?? selectedSpacer.insertedItems ?? []
      )
    : [];
  const selectedSpacerInsertedLayouts = selectedSpacer
    ? calculateAirspaceInsertLayouts(
        selectedSpacerDesiredOpticalAirGapMm,
        selectedSpacerWorkingInsertedItems,
        {
          targetStackOuterDiameterMm,
          nearbyClearApertureMm: selectedSpacerNearbyApertureMm
        }
      )
    : [];
  const selectedSpacerInsertDraftDirty =
    selectedSpacer !== undefined && draftInsertedItemsBySpacer[selectedSpacer.id] !== undefined;
  const selectedSpacerInsertStatusText =
    selectedSpacer !== undefined ? insertApplyStatusBySpacer[selectedSpacer.id] : undefined;
  const selectedSpacerInsertedWarnings = Array.from(
    new Set(
      selectedSpacerInsertedLayouts.flatMap((layout) =>
        layout.warnings.map((warning) => `${layout.item.label}: ${warning}`)
      )
    )
  );

  const commitProjectState = (nextItems: StackItem[], nextMechanicalParts: MechanicalPart[]) => {
    const normalizedInput = normalizePositions(nextItems);
    const withProfileSync = syncAdvancedGlassProfiles(normalizedInput);
    const withBarrelAutoFit = applyAutoFitBarrelDimensions(withProfileSync, project.cadDefaults);
    const normalizedMechanical = normalizeMechanicalParts(nextMechanicalParts);
    const withRetainingAutoFit = applyAutoFitRetainingRingDimensions(
      withBarrelAutoFit,
      normalizedMechanical,
      project.cadDefaults
    );
    const normalized = applyAutoFitSpacerDimensions(
      withRetainingAutoFit,
      normalizedMechanical,
      project.cadDefaults
    );
    onProjectChange({
      ...project,
      updatedAt: new Date().toISOString(),
      stackItems: normalized,
      mechanicalParts: normalizedMechanical
    });
  };

  const commitItems = (nextItems: StackItem[]) => {
    commitProjectState(nextItems, mechanicalParts);
  };

  const commitMechanicalParts = (nextMechanicalParts: MechanicalPart[]) => {
    commitProjectState(orderedItems, nextMechanicalParts);
  };

  const updateCadDefaults = (updater: (defaults: CadDefaults) => CadDefaults) => {
    onProjectChange({
      ...project,
      updatedAt: new Date().toISOString(),
      cadDefaults: updater(project.cadDefaults)
    });
  };

  useEffect(() => {
    const withProfileSync = syncAdvancedGlassProfiles(orderedItems);
    const withBarrelAutoFit = applyAutoFitBarrelDimensions(withProfileSync, project.cadDefaults);
    const withRetainingAutoFit = applyAutoFitRetainingRingDimensions(
      withBarrelAutoFit,
      mechanicalParts,
      project.cadDefaults
    );
    const adjusted = applyAutoFitSpacerDimensions(
      withRetainingAutoFit,
      mechanicalParts,
      project.cadDefaults
    );
    const changed = adjusted.some((item, index) => JSON.stringify(item) !== JSON.stringify(orderedItems[index]));
    if (changed) {
      commitProjectState(adjusted, mechanicalParts);
    }
  }, [orderedItems, mechanicalParts, project.cadDefaults]);

  const updateItem = (id: string, updater: (item: StackItem) => StackItem) => {
    commitItems(orderedItems.map((item) => (item.id === id ? updater(item) : item)));
  };

  const updateTypedItem = <T extends StackItem["type"]>(
    id: string,
    type: T,
    updater: (item: Extract<StackItem, { type: T }>) => Extract<StackItem, { type: T }>
  ) => {
    updateItem(id, (item) => {
      if (item.type !== type) return item;
      return updater(item as Extract<StackItem, { type: T }>);
    });
  };

  const updateSpacerInsertedItems = (
    spacerId: string,
    updater: (items: AirspaceInsertedItem[]) => AirspaceInsertedItem[]
  ) => {
    const sourceSpacer = orderedItems.find(
      (item): item is Extract<StackItem, { type: "spacer" }> => item.id === spacerId && item.type === "spacer"
    );
    const baseItems = normalizeAirspaceInsertedItems(
      draftInsertedItemsBySpacer[spacerId] ?? sourceSpacer?.insertedItems ?? []
    );
    const nextItems = normalizeAirspaceInsertedItems(updater(baseItems));
    setDraftInsertedItemsBySpacer((current) => ({
      ...current,
      [spacerId]: nextItems
    }));
    setInsertApplyStatusBySpacer((current) => ({
      ...current,
      [spacerId]: ""
    }));
  };

  const applySpacerInsertedItems = (spacerId: string) => {
    const sourceSpacer = orderedItems.find(
      (item): item is Extract<StackItem, { type: "spacer" }> => item.id === spacerId && item.type === "spacer"
    );
    if (!sourceSpacer) return;

    const nextItems = normalizeAirspaceInsertedItems(
      draftInsertedItemsBySpacer[spacerId] ?? sourceSpacer.insertedItems ?? []
    );
    updateTypedItem(spacerId, "spacer", (entry) => ({
      ...entry,
      insertedItems: nextItems,
      insertedItemsTotalThicknessMm: Number(getAirspaceInsertedItemsTotalThicknessMm(nextItems).toFixed(3))
    }));
    setDraftInsertedItemsBySpacer((current) => {
      const next = { ...current };
      delete next[spacerId];
      return next;
    });
    const desiredAirspaceMm = getSpacerDesiredOpticalAirGapMm(sourceSpacer);
    setInsertApplyStatusBySpacer((current) => ({
      ...current,
      [spacerId]: `AirSpace inserts saved. Total airspace remains ${desiredAirspaceMm.toFixed(3)}mm.`
    }));
  };

  const addInsertedItemToSpacer = (
    spacerId: string,
    type: AirspaceInsertedItem["type"],
    airspaceLabel: string,
    diskDiameterMm: number
  ) => {
    updateSpacerInsertedItems(spacerId, (items) => [
      ...items,
      createDefaultAirspaceInsertedItem({
        id: createId("airspace_insert"),
        type,
        airspaceLabel,
        targetStackOuterDiameterMm: diskDiameterMm
      })
    ]);
  };

  const setAdvancedProfileEnabled = (glassId: string, enabled: boolean) => {
    updateTypedItem(glassId, "glass", (entry) => {
      const profile = getEffectiveAdvancedProfile(entry);
      if (!enabled) {
        return {
          ...entry,
          advancedProfileEnabled: false,
          advancedProfile: {
            ...profile,
            enabled: false
          }
        };
      }

      const sections = profile.sections.length ? normalizeAdvancedSections(profile.sections) : [];
      const normalizedProfile: AdvancedGlassProfile = {
        ...profile,
        enabled: true,
        totalLengthMm: profile.totalLengthMm > 0 ? profile.totalLengthMm : Number(entry.thicknessMm.toFixed(2)),
        maxDiameterMm: profile.maxDiameterMm > 0 ? profile.maxDiameterMm : Number(entry.diameterMm.toFixed(2)),
        sections
      };
      const segments = advancedSectionsToLegacySegments(normalizedProfile.sections);
      return {
        ...entry,
        advancedProfileEnabled: true,
        advancedProfile: normalizedProfile,
        profileSegments: segments
      };
    });
  };

  const setSteppedProfileEnabled = (glassId: string, enabled: boolean) => {
    updateTypedItem(glassId, "glass", (entry) => {
      if (!enabled) {
        return {
          ...entry,
          hasSteppedProfile: false
        };
      }

      const largeDiameter = toPositive(entry.largeDiameterMm) > 0 ? entry.largeDiameterMm ?? entry.diameterMm : entry.diameterMm;
      const smallDiameter =
        toPositive(entry.smallDiameterMm) > 0
          ? entry.smallDiameterMm ?? Math.max(0.1, entry.diameterMm - 2)
          : Number(Math.max(0.1, entry.diameterMm - 2).toFixed(2));
      const largeSectionThickness =
        toPositive(entry.largeSectionThicknessMm) > 0
          ? entry.largeSectionThicknessMm ?? entry.thicknessMm / 2
          : Number((entry.thicknessMm / 2).toFixed(2));
      const smallSectionThickness =
        toPositive(entry.smallSectionThicknessMm) > 0
          ? entry.smallSectionThicknessMm ?? Math.max(0.1, entry.thicknessMm - largeSectionThickness)
          : Number((entry.thicknessMm - largeSectionThickness).toFixed(2));

      return {
        ...entry,
        hasSteppedProfile: true,
        largeDiameterMm: Number(Math.max(0.1, largeDiameter).toFixed(2)),
        smallDiameterMm: Number(Math.max(0.1, smallDiameter).toFixed(2)),
        largeSectionThicknessMm: Number(Math.max(0.1, largeSectionThickness).toFixed(2)),
        smallSectionThicknessMm: Number(Math.max(0.1, smallSectionThickness).toFixed(2)),
        stepDirection: entry.stepDirection ?? "unknown"
      };
    });
  };

  const updateAdvancedProfile = (
    glassId: string,
    updater: (profile: AdvancedGlassProfile, glass: Extract<StackItem, { type: "glass" }>) => AdvancedGlassProfile
  ) => {
    updateTypedItem(glassId, "glass", (entry) => {
      const profile = getEffectiveAdvancedProfile(entry);
      const nextProfile = updater(profile, entry);
      const normalizedProfile: AdvancedGlassProfile = {
        ...nextProfile,
        sections: normalizeAdvancedSections(nextProfile.sections ?? [])
      };
      return {
        ...entry,
        advancedProfile: normalizedProfile,
        advancedProfileEnabled: normalizedProfile.enabled,
        profileSegments: advancedSectionsToLegacySegments(normalizedProfile.sections)
      };
    });
  };

  const addAdvancedProfileSection = (glassId: string) => {
    updateAdvancedProfile(glassId, (profile, glass) => {
      const nextSections = normalizeAdvancedSections([
        ...(profile.sections ?? []),
        {
          id: createId("advsec"),
          index: profile.sections?.length ?? 0,
          label: `Section ${(profile.sections?.length ?? 0) + 1}`,
          diameterMm: Number(Math.max(0.1, profile.maxDiameterMm || glass.diameterMm).toFixed(2)),
          lengthMm: 1
        }
      ]);
      return {
        ...profile,
        sections: nextSections
      };
    });
  };

  const removeAdvancedProfileSection = (glassId: string, sectionId: string) => {
    updateAdvancedProfile(glassId, (profile) => ({
      ...profile,
      sections: normalizeAdvancedSections((profile.sections ?? []).filter((section) => section.id !== sectionId))
    }));
  };

  const moveItem = (id: string, direction: -1 | 1) => {
    const index = orderedItems.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= orderedItems.length) return;
    if (orderedItems[index].locked || orderedItems[target].locked) return;

    const next = orderedItems.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    commitItems(next);
  };

  const addItem = (type: StackItemType) => {
    const newItem = createStackItem(type, orderedItems.length);
    commitItems([...orderedItems, newItem]);
    setSelectedId(newItem.id);
  };

  const duplicateItem = (id: string) => {
    const source = orderedItems.find((item) => item.id === id);
    if (!source) return;
    const clone: StackItem = {
      ...source,
      id: createId(source.type),
      name: `${source.name} copy`,
      locked: false
    } as StackItem;
    const index = orderedItems.findIndex((item) => item.id === id);
    const next = orderedItems.slice();
    next.splice(index + 1, 0, clone);
    commitItems(next);
    setSelectedId(clone.id);
  };

  const deleteItem = (id: string) => {
    commitItems(orderedItems.filter((item) => item.id !== id));
    if (selectedId === id) {
      setSelectedId(undefined);
    }
  };

  const autoFitSpacer = (id: string) => {
    const withBarrelAutoFit = applyAutoFitBarrelDimensions(orderedItems, project.cadDefaults);
    const index = withBarrelAutoFit.findIndex((item) => item.id === id);
    if (index < 0) return;
    const target = withBarrelAutoFit[index];
    if (target.type !== "spacer") return;
    const auto = deriveSpacerRingDimensions(withBarrelAutoFit, mechanicalParts, project.cadDefaults, index, target);
    updateTypedItem(id, "spacer", (entry) => ({ ...entry, ...auto }));
  };

  const autoFitBarrel = (id: string) => {
    const target = orderedItems.find((item) => item.id === id);
    if (!target || target.type !== "barrel") return;
    const auto = deriveBarrelDimensionsFromStack(orderedItems, project.cadDefaults);
    updateTypedItem(id, "barrel", (entry) => ({
      ...entry,
      ...auto
    }));
  };

  const autoFitRetainingRing = (id: string) => {
    const withBarrelAutoFit = applyAutoFitBarrelDimensions(orderedItems, project.cadDefaults);
    const index = withBarrelAutoFit.findIndex((item) => item.id === id);
    if (index < 0) return;
    const target = withBarrelAutoFit[index];
    if (target.type !== "retaining_ring") return;
    const auto = deriveRetainingRingDimensions(withBarrelAutoFit, mechanicalParts, project.cadDefaults, index);
    updateTypedItem(id, "retaining_ring", (entry) => ({
      ...entry,
      ...auto
    }));
  };

  const autoFitAllSpacers = () => {
    const withBarrelAutoFit = applyAutoFitBarrelDimensions(orderedItems, project.cadDefaults);
    const withRetainingAutoFit = applyAutoFitRetainingRingDimensions(
      withBarrelAutoFit,
      mechanicalParts,
      project.cadDefaults
    );
    const adjusted = applyAutoFitSpacerDimensions(withRetainingAutoFit, mechanicalParts, project.cadDefaults);
    commitItems(adjusted);
  };

  const resolvedTargetStackOuterDiameterMm = Number(
    getTargetStackOuterDiameter(orderedItems, mechanicalParts, project.cadDefaults).toFixed(2)
  );
  const resolvedLargestGlassDiameterMm = Number(getLargestGlassMaxDiameter(orderedItems).toFixed(2));
  const resolvedOpticalStackLengthMm = Number(getTotalStackLength(orderedItems).toFixed(2));
  const resolvedCupToCarrierClearanceMm = Math.max(
    0,
    toPositive(project.cadDefaults.cupToCarrierClearanceMm) || DEFAULT_CUP_TO_CARRIER_CLEARANCE_MM
  );
  const resolvedCarrierInnerDiameterMm = Number(
    (
      toPositive(project.cadDefaults.carrierInnerDiameterMm) ||
      resolvedTargetStackOuterDiameterMm + resolvedCupToCarrierClearanceMm
    ).toFixed(2)
  );
  const resolvedCarrierWallThicknessMm = Number(
    (toPositive(project.cadDefaults.carrierWallThicknessMm) || DEFAULT_CARRIER_WALL_THICKNESS_MM).toFixed(2)
  );
  const resolvedCarrierOuterDiameterMm = Number(
    (resolvedCarrierInnerDiameterMm + resolvedCarrierWallThicknessMm * 2).toFixed(2)
  );
  const resolvedCarrierToBarrelClearanceMm = Number(
    (Math.max(0, toPositive(project.cadDefaults.carrierToBarrelClearanceMm) || DEFAULT_CARRIER_TO_BARREL_CLEARANCE_MM)).toFixed(2)
  );
  const resolvedFixedBarrelInnerDiameterMm = Number(
    (
      toPositive(project.cadDefaults.fixedBarrelInnerDiameterMm) ||
      resolvedCarrierOuterDiameterMm + resolvedCarrierToBarrelClearanceMm
    ).toFixed(2)
  );
  const resolvedFixedBarrelWallThicknessMm = Number(
    (toPositive(project.cadDefaults.fixedBarrelWallThicknessMm) || DEFAULT_FIXED_BARREL_WALL_THICKNESS_MM).toFixed(2)
  );
  const resolvedFixedBarrelOuterDiameterMm = Number(
    (resolvedFixedBarrelInnerDiameterMm + resolvedFixedBarrelWallThicknessMm * 2).toFixed(2)
  );

  return (
    <div className="space-y-4">
      <AddStackItemModal onAdd={addItem} />
      <div className="flex justify-end">
        <Button variant="ghost" onClick={autoFitAllSpacers} className="text-xs">
          Auto-fit barrel + spacer + retaining rings
        </Button>
      </div>
      <div className="panel space-y-3 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-labMuted">
          Auto-fit System Overrides
        </h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <NumberInput
            label="Cup-to-carrier clearance (mm)"
            value={project.cadDefaults.cupToCarrierClearanceMm ?? DEFAULT_CUP_TO_CARRIER_CLEARANCE_MM}
            min={0}
            step={0.01}
            onChange={(event) =>
              updateCadDefaults((defaults) => ({
                ...defaults,
                cupToCarrierClearanceMm: Number.isFinite(event.target.valueAsNumber)
                  ? event.target.valueAsNumber
                  : DEFAULT_CUP_TO_CARRIER_CLEARANCE_MM
              }))
            }
          />
          <NumberInput
            label="Target stack outer diameter override (mm, 0 = auto)"
            value={project.cadDefaults.targetStackOuterDiameterMm ?? 0}
            min={0}
            step={0.01}
            onChange={(event) =>
              updateCadDefaults((defaults) => ({
                ...defaults,
                targetStackOuterDiameterMm:
                  Number.isFinite(event.target.valueAsNumber) && event.target.valueAsNumber > 0
                    ? event.target.valueAsNumber
                    : undefined
              }))
            }
          />
          <NumberInput
            label="Carrier inner diameter override (mm, 0 = auto)"
            value={project.cadDefaults.carrierInnerDiameterMm ?? 0}
            min={0}
            step={0.01}
            onChange={(event) =>
              updateCadDefaults((defaults) => ({
                ...defaults,
                carrierInnerDiameterMm:
                  Number.isFinite(event.target.valueAsNumber) && event.target.valueAsNumber > 0
                    ? event.target.valueAsNumber
                    : undefined
              }))
            }
          />
          <NumberInput
            label="Carrier wall thickness override (mm, 0 = auto)"
            value={project.cadDefaults.carrierWallThicknessMm ?? 0}
            min={0}
            step={0.01}
            onChange={(event) =>
              updateCadDefaults((defaults) => ({
                ...defaults,
                carrierWallThicknessMm:
                  Number.isFinite(event.target.valueAsNumber) && event.target.valueAsNumber > 0
                    ? event.target.valueAsNumber
                    : undefined
              }))
            }
          />
          <NumberInput
            label="Carrier-to-barrel clearance override (mm, 0 = auto)"
            value={project.cadDefaults.carrierToBarrelClearanceMm ?? 0}
            min={0}
            step={0.01}
            onChange={(event) =>
              updateCadDefaults((defaults) => ({
                ...defaults,
                carrierToBarrelClearanceMm:
                  Number.isFinite(event.target.valueAsNumber) && event.target.valueAsNumber > 0
                    ? event.target.valueAsNumber
                    : undefined
              }))
            }
          />
          <NumberInput
            label="Fixed barrel inner diameter override (mm, 0 = auto)"
            value={project.cadDefaults.fixedBarrelInnerDiameterMm ?? 0}
            min={0}
            step={0.01}
            onChange={(event) =>
              updateCadDefaults((defaults) => ({
                ...defaults,
                fixedBarrelInnerDiameterMm:
                  Number.isFinite(event.target.valueAsNumber) && event.target.valueAsNumber > 0
                    ? event.target.valueAsNumber
                    : undefined
              }))
            }
          />
          <NumberInput
            label="Fixed barrel wall thickness override (mm, 0 = auto)"
            value={project.cadDefaults.fixedBarrelWallThicknessMm ?? 0}
            min={0}
            step={0.01}
            onChange={(event) =>
              updateCadDefaults((defaults) => ({
                ...defaults,
                fixedBarrelWallThicknessMm:
                  Number.isFinite(event.target.valueAsNumber) && event.target.valueAsNumber > 0
                    ? event.target.valueAsNumber
                    : undefined
              }))
            }
          />
        </div>
        <div className="grid gap-2 text-xs leading-relaxed text-labMuted md:grid-cols-2">
          <p>
            Largest glass diameter: <span className="mono text-labText">{resolvedLargestGlassDiameterMm.toFixed(2)} mm</span>
          </p>
          <p>
            Optical stack length: <span className="mono text-labText">{resolvedOpticalStackLengthMm.toFixed(2)} mm</span>
          </p>
          <p>
            Shared stack OD (lens cups + spacers):{" "}
            <span className="mono text-labText">{resolvedTargetStackOuterDiameterMm.toFixed(2)} mm</span>
          </p>
          <p>
            Lens cup OD / spacer OD:{" "}
            <span className="mono text-labText">
              {resolvedTargetStackOuterDiameterMm.toFixed(2)} / {resolvedTargetStackOuterDiameterMm.toFixed(2)} mm
            </span>
          </p>
          <p>
            Carrier ID / OD:{" "}
            <span className="mono text-labText">
              {resolvedCarrierInnerDiameterMm.toFixed(2)} / {resolvedCarrierOuterDiameterMm.toFixed(2)} mm
            </span>
          </p>
          <p>
            Fixed barrel ID / OD:{" "}
            <span className="mono text-labText">
              {resolvedFixedBarrelInnerDiameterMm.toFixed(2)} / {resolvedFixedBarrelOuterDiameterMm.toFixed(2)} mm
            </span>
          </p>
        </div>
        <p className="text-xs leading-relaxed text-labMuted">
          Auto mode uses: target stack OD = largest glass + 2 x 2.0mm wall, rounded up to 0.5mm; carrier ID = stack
          OD + clearance; fixed barrel ID = carrier OD + clearance.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr_360px]">
        <section className="panel space-y-2 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-labMuted">Stack Items (Front to Sensor)</h3>
          {orderedItems.length === 0 && <p className="text-sm text-labMuted">No stack items yet.</p>}
          {orderedItems.map((item) => (
            <StackItemCard
              key={item.id}
              item={item}
              selected={selectedItem?.id === item.id}
              onSelect={() => setSelectedId(item.id)}
              onMoveUp={() => moveItem(item.id, -1)}
              onMoveDown={() => moveItem(item.id, 1)}
              onDuplicate={() => duplicateItem(item.id)}
              onDelete={() => deleteItem(item.id)}
              onToggleLock={() => updateItem(item.id, (entry) => ({ ...entry, locked: !entry.locked }))}
            />
          ))}
        </section>

        <section className="space-y-4">
          <StackPreview2D
            items={orderedItems}
            mechanicalParts={mechanicalParts}
            selectedId={selectedItem?.id}
            onSelect={setSelectedId}
          />
          <StackSummary
            items={orderedItems}
            defaults={project.cadDefaults}
            mechanicalPartsCount={mechanicalParts.length}
          />
        </section>

        <section className="panel p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-labMuted">Item Editor</h3>
          {!selectedItem && <p className="text-sm text-labMuted">Select an item to edit.</p>}
          {selectedItem && (
            <div className="space-y-3">
              <Input
                label="Item name"
                value={selectedItem.name}
                onChange={(event) =>
                  updateItem(selectedItem.id, (entry) => ({
                    ...entry,
                    name: event.target.value
                  }))
                }
              />
              <Select
                label="Type"
                value={getItemOpticalType(selectedItem)}
                onChange={(event) =>
                  updateItem(selectedItem.id, (entry) => ({
                    ...entry,
                    opticalType: event.target.value as OpticalItemType
                  }))
                }
              >
                {opticalTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Input
                label="Notes"
                value={selectedItem.notes ?? ""}
                onChange={(event) =>
                  updateItem(selectedItem.id, (entry) => ({
                    ...entry,
                    notes: event.target.value
                  }))
                }
              />

              {selectedItem.type === "glass" && (
                <>
                  <NumberInput
                    label="Diameter (mm)"
                    value={selectedItem.diameterMm}
                    min={0}
                    disabled={Boolean(selectedAdvancedProfile?.enabled)}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "glass", (entry) => ({
                        ...entry,
                        diameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Thickness (mm)"
                    value={selectedItem.thicknessMm}
                    min={0}
                    disabled={Boolean(selectedAdvancedProfile?.enabled)}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "glass", (entry) => ({
                        ...entry,
                        thicknessMm: Number(event.target.value)
                      }))
                    }
                  />
                  <Select
                    label="Thickness measurement type"
                    value={selectedItem.thicknessMeasurementType ?? "unknown"}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "glass", (entry) => ({
                        ...entry,
                        thicknessMeasurementType: event.target.value as
                          | "edge_thickness"
                          | "center_max_thickness"
                          | "straight_body_thickness"
                          | "mechanical_block_length"
                          | "estimated"
                          | "unknown"
                      }))
                    }
                  >
                    {thicknessMeasurementTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                  <Select
                    label="Thickness confidence"
                    value={selectedItem.thicknessConfidence ?? "unknown"}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "glass", (entry) => ({
                        ...entry,
                        thicknessConfidence: event.target.value as "measured" | "estimated" | "unknown"
                      }))
                    }
                  >
                    {measurementConfidenceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                  <NumberInput
                    label="Clear aperture / usable optical diameter (mm)"
                    value={selectedItem.clearApertureMm ?? ""}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "glass", (entry) => ({
                        ...entry,
                        clearApertureMm: event.target.value ? Number(event.target.value) : undefined
                      }))
                    }
                  />
                  <p className="text-xs leading-relaxed text-labMuted">
                    Thickness can be edge thickness, center/max thickness, straight body thickness, or an estimate.
                    AirSpaces should be used as the primary truth for optical positioning.
                  </p>
                  <p className="text-xs leading-relaxed text-labMuted">
                    Optional. Leave empty if unknown. This is the usable optical diameter, not the physical glass
                    diameter. Used for vignetting and retaining-lip warnings.
                  </p>
                  <div className="rounded-xl border border-labBorder bg-[#0b0b0b] p-3">
                    <label className="flex items-center gap-2 text-sm text-labMuted">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedItem.hasSteppedProfile)}
                        onChange={(event) => setSteppedProfileEnabled(selectedItem.id, event.target.checked)}
                      />
                      Has stepped profile
                    </label>
                    {selectedItem.hasSteppedProfile && (
                      <div className="mt-3 space-y-3">
                        <NumberInput
                          label="Large diameter (mm)"
                          value={selectedItem.largeDiameterMm ?? ""}
                          min={0}
                          step="0.01"
                          onChange={(event) =>
                            updateTypedItem(selectedItem.id, "glass", (entry) => ({
                              ...entry,
                              largeDiameterMm: event.target.value ? Number(event.target.value) : undefined
                            }))
                          }
                        />
                        <NumberInput
                          label="Small diameter (mm)"
                          value={selectedItem.smallDiameterMm ?? ""}
                          min={0}
                          step="0.01"
                          onChange={(event) =>
                            updateTypedItem(selectedItem.id, "glass", (entry) => ({
                              ...entry,
                              smallDiameterMm: event.target.value ? Number(event.target.value) : undefined
                            }))
                          }
                        />
                        <NumberInput
                          label="Large section thickness (mm)"
                          value={selectedItem.largeSectionThicknessMm ?? ""}
                          min={0}
                          step="0.01"
                          onChange={(event) =>
                            updateTypedItem(selectedItem.id, "glass", (entry) => ({
                              ...entry,
                              largeSectionThicknessMm: event.target.value ? Number(event.target.value) : undefined
                            }))
                          }
                        />
                        <NumberInput
                          label="Small section thickness (mm)"
                          value={selectedItem.smallSectionThicknessMm ?? ""}
                          min={0}
                          step="0.01"
                          onChange={(event) =>
                            updateTypedItem(selectedItem.id, "glass", (entry) => ({
                              ...entry,
                              smallSectionThicknessMm: event.target.value ? Number(event.target.value) : undefined
                            }))
                          }
                        />
                        <Select
                          label="Step direction"
                          value={selectedItem.stepDirection ?? "unknown"}
                          onChange={(event) =>
                            updateTypedItem(selectedItem.id, "glass", (entry) => ({
                              ...entry,
                              stepDirection: event.target.value as StepDirection
                            }))
                          }
                        >
                          {stepDirectionOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                        <p className="text-xs leading-relaxed text-labMuted">
                          Stepped profile drives stepped cup generation in CAD. Keep these values measured from the
                          physical optical block.
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-labBorder bg-[#0b0b0b] p-3">
                    <p className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-labMuted">
                      Advanced Physical Profile
                    </p>
                    <label className="flex items-center gap-2 text-sm text-labMuted">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedAdvancedProfile?.enabled)}
                        onChange={(event) => setAdvancedProfileEnabled(selectedItem.id, event.target.checked)}
                      />
                      Enable advanced profile
                    </label>

                    {selectedAdvancedProfile?.enabled && (
                      <div className="mt-3 space-y-3">
                        <NumberInput
                          label="Total length mm"
                          value={selectedAdvancedProfile.totalLengthMm}
                          min={0}
                          step="0.01"
                          onChange={(event) =>
                            updateAdvancedProfile(selectedItem.id, (profile) => ({
                              ...profile,
                              totalLengthMm: Number(event.target.value)
                            }))
                          }
                        />
                        <NumberInput
                          label="Max diameter mm"
                          value={selectedAdvancedProfile.maxDiameterMm}
                          min={0}
                          step="0.01"
                          onChange={(event) =>
                            updateAdvancedProfile(selectedItem.id, (profile) => ({
                              ...profile,
                              maxDiameterMm: Number(event.target.value)
                            }))
                          }
                        />
                        <NumberInput
                          label="Max diameter starts at mm from front"
                          value={selectedAdvancedProfile.maxDiameterPositionFromFrontMm}
                          min={0}
                          step="0.01"
                          onChange={(event) =>
                            updateAdvancedProfile(selectedItem.id, (profile) => ({
                              ...profile,
                              maxDiameterPositionFromFrontMm: Number(event.target.value)
                            }))
                          }
                        />

                        <div className="space-y-2">
                          {selectedAdvancedSections.map((section) => (
                            <div key={section.id} className="rounded-lg border border-labBorder bg-[#090909] p-2">
                              <div className="mb-2 text-xs uppercase tracking-[0.12em] text-labMuted">
                                Section {section.index + 1}
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <Input
                                  label="Label"
                                  value={section.label ?? ""}
                                  onChange={(event) =>
                                    updateAdvancedProfile(selectedItem.id, (profile) => ({
                                      ...profile,
                                      sections: normalizeAdvancedSections(
                                        (profile.sections ?? []).map((entry) =>
                                          entry.id === section.id ? { ...entry, label: event.target.value } : entry
                                        )
                                      )
                                    }))
                                  }
                                />
                                <NumberInput
                                  label="Diameter mm"
                                  value={section.diameterMm}
                                  min={0}
                                  step="0.01"
                                  onChange={(event) =>
                                    updateAdvancedProfile(selectedItem.id, (profile) => ({
                                      ...profile,
                                      sections: normalizeAdvancedSections(
                                        (profile.sections ?? []).map((entry) =>
                                          entry.id === section.id
                                            ? { ...entry, diameterMm: sanitizeSegmentValue(Number(event.target.value)) }
                                            : entry
                                        )
                                      )
                                    }))
                                  }
                                />
                                <NumberInput
                                  label="Length mm"
                                  value={section.lengthMm}
                                  min={0}
                                  step="0.01"
                                  onChange={(event) =>
                                    updateAdvancedProfile(selectedItem.id, (profile) => ({
                                      ...profile,
                                      sections: normalizeAdvancedSections(
                                        (profile.sections ?? []).map((entry) =>
                                          entry.id === section.id
                                            ? { ...entry, lengthMm: sanitizeSegmentValue(Number(event.target.value)) }
                                            : entry
                                        )
                                      )
                                    }))
                                  }
                                />
                                <div className="flex items-end">
                                  <Button
                                    type="button"
                                    variant="danger"
                                    className="w-full"
                                    onClick={() => removeAdvancedProfileSection(selectedItem.id, section.id)}
                                  >
                                    Delete
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                          {selectedAdvancedSections.length === 0 && (
                            <p className="text-sm text-labMuted">No sections defined.</p>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="ghost" onClick={() => addAdvancedProfileSection(selectedItem.id)}>
                            Add section
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              updateAdvancedProfile(selectedItem.id, (_profile, glass) => ({
                                ...createDefaultAdvancedProfile(glass),
                                enabled: false,
                                sections: [],
                                totalLengthMm: Number(Math.max(0, glass.thicknessMm).toFixed(2)),
                                maxDiameterMm: Number(Math.max(0, glass.diameterMm).toFixed(2)),
                                maxDiameterPositionFromFrontMm: 0
                              }))
                            }
                          >
                            Clear profile
                          </Button>
                        </div>

                        <div className="rounded-lg border border-labBorder bg-[#090909] p-2 text-xs">
                          <div className="flex justify-between gap-2">
                            <span className="text-labMuted">Section length sum</span>
                            <span className="mono text-labText">{selectedAdvancedSectionSum.toFixed(2)} mm</span>
                          </div>
                          <div className="mt-1 flex justify-between gap-2">
                            <span className="text-labMuted">Difference from total length</span>
                            <span
                              className={`mono ${
                                selectedAdvancedLengthDifferenceAbs > 2
                                  ? "text-labDanger"
                                  : selectedAdvancedLengthDifferenceAbs > 1
                                    ? "text-labWarning"
                                    : "text-labText"
                              }`}
                            >
                              {selectedAdvancedLengthDifference.toFixed(2)} mm
                            </span>
                          </div>
                          {selectedAdvancedLengthDifferenceAbs > 2 && (
                            <p className="mt-2 text-labDanger">Warning: difference is greater than 2.0 mm.</p>
                          )}
                          {selectedAdvancedLengthDifferenceAbs > 1 && selectedAdvancedLengthDifferenceAbs <= 2 && (
                            <p className="mt-2 text-labWarning">Warning: difference is greater than 1.0 mm.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-labBorder bg-[#0b0b0b] p-3">
                    <p className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-labMuted">
                      Cup Insertion + Retaining
                    </p>
                    <Select
                      label="Cup insertion side"
                      value={selectedItem.cupInsertionSide ?? "auto"}
                      onChange={(event) =>
                        updateTypedItem(selectedItem.id, "glass", (entry) => ({
                          ...entry,
                          cupInsertionSide: event.target.value as "auto" | "front" | "rear"
                        }))
                      }
                    >
                      {cupInsertionSideOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                    <Select
                      label="Cup retaining side"
                      value={selectedItem.cupRetainingSide ?? "auto"}
                      onChange={(event) =>
                        updateTypedItem(selectedItem.id, "glass", (entry) => ({
                          ...entry,
                          cupRetainingSide: event.target.value as "auto" | "front" | "rear" | "both" | "none"
                        }))
                      }
                    >
                      {cupRetainingSideOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                    <p className="text-xs leading-relaxed text-labMuted">
                      Optical profile stays FRONT → SENSOR. Cup insertion side is a mechanical loading choice and is
                      handled during CAD generation.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-labMuted">
                    <input
                      type="checkbox"
                      checked={selectedItem.flipped}
                      onChange={(event) =>
                        updateTypedItem(selectedItem.id, "glass", (entry) => ({
                          ...entry,
                          flipped: event.target.checked
                        }))
                      }
                    />
                    Flipped
                  </label>
                </>
              )}

              {selectedItem.type === "spacer" && (
                <>
                  <p className="rounded-lg border border-labBorder bg-[#0b0b0b] px-3 py-2 text-xs leading-relaxed text-labMuted">
                    AirSpace is the optical/layout target. This spacer is the generated mechanical part used to
                    realize that airspace in the stack.
                  </p>
                  <Select
                    label="Spacer diameter mode"
                    value={getSpacerDiameterMode(selectedItem)}
                    onChange={(event) => {
                      const nextMode = event.target.value as SpacerDiameterMode;
                      updateTypedItem(selectedItem.id, "spacer", (entry) => ({
                        ...entry,
                        spacerDiameterMode: nextMode,
                        autoFitToBarrel: nextMode !== "manual",
                        manualInnerDiameterMm:
                          nextMode === "manual"
                            ? toPositive(entry.manualInnerDiameterMm) > 0
                              ? entry.manualInnerDiameterMm
                              : entry.innerDiameterMm
                            : entry.manualInnerDiameterMm,
                        manualOuterDiameterMm:
                          nextMode === "manual"
                            ? toPositive(entry.manualOuterDiameterMm) > 0
                              ? entry.manualOuterDiameterMm
                              : entry.outerDiameterMm
                            : entry.manualOuterDiameterMm
                      }));
                    }}
                  >
                    {spacerDiameterModeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                  {getSpacerDiameterMode(selectedItem) !== "manual" && (
                    <Button
                      variant="ghost"
                      className="w-full text-xs"
                      onClick={() => autoFitSpacer(selectedItem.id)}
                    >
                      Recalculate spacer sizing now
                    </Button>
                  )}
                  <NumberInput
                    label="Inner diameter (mm)"
                    value={selectedItem.innerDiameterMm}
                    min={0}
                    disabled={getSpacerDiameterMode(selectedItem) !== "manual"}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "spacer", (entry) => ({
                        ...entry,
                        innerDiameterMm: Number(event.target.value),
                        manualInnerDiameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Outer diameter (mm)"
                    value={selectedItem.outerDiameterMm}
                    min={0}
                    disabled
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "spacer", (entry) => ({
                        ...entry,
                        outerDiameterMm: Number(event.target.value),
                        manualOuterDiameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <p className="text-xs leading-relaxed text-labMuted">
                    Spacer OD is locked to the shared stack OD so all spacers and lens cups stay cylindrical.
                  </p>
                  <NumberInput
                    label="Desired optical air gap mm"
                    value={selectedSpacerDesiredOpticalAirGapMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "spacer", (entry) => ({
                        ...entry,
                        desiredOpticalAirGapMm: Number(event.target.value),
                        thicknessMm:
                          getSpacerThicknessSource(entry) === "manual_override"
                            ? entry.thicknessMm
                            : Number(event.target.value),
                        physicalSpacerThicknessMm:
                          getSpacerThicknessSource(entry) === "manual_override"
                            ? entry.physicalSpacerThicknessMm
                            : Number(event.target.value)
                      }))
                    }
                  />
                  <Select
                    label="Airspace measurement type"
                    value={selectedItem.airspaceMeasurementType ?? "unknown"}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "spacer", (entry) => ({
                        ...entry,
                        airspaceMeasurementType: event.target.value as
                          | "optical_surface_to_optical_surface"
                          | "mechanical_edge_or_seat_to_edge_or_seat"
                          | "cad_face_to_cad_face"
                          | "physical_caliper_estimate"
                          | "estimated"
                          | "unknown"
                      }))
                    }
                  >
                    {airspaceMeasurementTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                  <Select
                    label="Airspace confidence"
                    value={selectedItem.airspaceConfidence ?? "unknown"}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "spacer", (entry) => ({
                        ...entry,
                        airspaceConfidence: event.target.value as "measured" | "estimated" | "unknown"
                      }))
                    }
                  >
                    {measurementConfidenceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                  <NumberInput
                    label="Printed spacer thickness mm"
                    value={selectedSpacerPhysicalThicknessMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "spacer", (entry) => ({
                        ...entry,
                        thicknessMm: Number(event.target.value),
                        physicalSpacerThicknessMm: Number(event.target.value),
                        physicalSpacerThicknessSource: "manual_override"
                      }))
                    }
                  />
                  <Select
                    label="Source of printed spacer thickness"
                    value={selectedSpacerThicknessSource}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "spacer", (entry) => {
                        const nextSource = event.target.value as
                          | "same_as_airspace"
                          | "calculated_from_cup_offsets"
                          | "manual_override";
                        const desired = getSpacerDesiredOpticalAirGapMm(entry);
                        return {
                          ...entry,
                          physicalSpacerThicknessSource: nextSource,
                          physicalSpacerThicknessMm:
                            nextSource === "manual_override"
                              ? getSpacerPhysicalThicknessMm(entry)
                              : desired,
                          thicknessMm: nextSource === "manual_override" ? getSpacerPhysicalThicknessMm(entry) : desired
                        };
                      })
                    }
                  >
                    {spacerThicknessSourceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                  {selectedSpacerThicknessSource === "same_as_airspace" && (
                    <p className="text-xs leading-relaxed text-labMuted">
                      Printed spacer currently equals measured airspace. Cup offset compensation not applied.
                    </p>
                  )}
                  {selectedSpacerThicknessSource === "calculated_from_cup_offsets" && (
                    <p className="text-xs leading-relaxed text-labMuted">
                      Printed spacer thickness is prepared for cup-offset compensation. Final compensation is applied in
                      CAD generation when offsets are available.
                    </p>
                  )}
                  {selectedSpacerThicknessSource === "manual_override" && (
                    <p className="text-xs leading-relaxed text-labMuted">
                      Manual override is active. Desired optical air gap and printed spacer thickness are tracked
                      separately.
                    </p>
                  )}
                  <div className="rounded-xl border border-labBorder bg-[#0b0b0b] p-3">
                    <p className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-labMuted">
                      Inserted items inside this airspace
                    </p>
                    <p className="text-xs leading-relaxed text-labMuted">
                      Desired optical airspace stays fixed at {selectedSpacerDesiredOpticalAirGapMm.toFixed(3)}mm.
                      Inserted items split the generated spacer into before/after sections.
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-xs"
                        onClick={() =>
                          addInsertedItemToSpacer(
                            selectedItem.id,
                            "iris",
                            selectedItem.name || "airspace",
                            targetStackOuterDiameterMm
                          )
                        }
                      >
                        Add Iris
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-xs"
                        onClick={() =>
                          addInsertedItemToSpacer(
                            selectedItem.id,
                            "filter",
                            selectedItem.name || "airspace",
                            targetStackOuterDiameterMm
                          )
                        }
                      >
                        Add Filter
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-xs"
                        onClick={() =>
                          addInsertedItemToSpacer(
                            selectedItem.id,
                            "diffusion",
                            selectedItem.name || "airspace",
                            targetStackOuterDiameterMm
                          )
                        }
                      >
                        Add Diffusion
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-xs"
                        onClick={() =>
                          addInsertedItemToSpacer(
                            selectedItem.id,
                            "custom",
                            selectedItem.name || "airspace",
                            targetStackOuterDiameterMm
                          )
                        }
                      >
                        Add Custom Insert
                      </Button>
                    </div>
                    <div className="mt-3 space-y-1">
                      <p className="text-xs text-labMuted">
                        CAD/export will generate spacer-before + insert disk + spacer-after while keeping the original
                        AirSpace as optical source of truth.
                      </p>
                      {selectedSpacerInsertDraftDirty ? (
                        <p className="text-xs text-labWarning">
                          Changes are staged locally. Click Apply AirSpace Inserts to save this AirSpace.
                        </p>
                      ) : (selectedItem.insertedItems?.length ?? 0) > 0 ? (
                        <p className="text-xs text-labMuted">Inserted item is active inside this AirSpace.</p>
                      ) : (
                        <p className="text-xs text-labMuted">No inserted items active inside this AirSpace.</p>
                      )}
                      {selectedSpacerInsertStatusText && (
                        <p className="text-xs text-labAccent">{selectedSpacerInsertStatusText}</p>
                      )}
                    </div>

                    {selectedSpacerInsertedLayouts.length === 0 && (
                      <p className="mt-3 text-xs text-labMuted">
                        No inserted items yet. Add iris/filter/diffusion/custom inserts here to keep them inside this
                        airspace without changing total optical stack length.
                      </p>
                    )}

                    {selectedSpacerInsertedLayouts.length > 0 && (
                      <div className="mt-3 space-y-3">
                        {selectedSpacerInsertedLayouts.map((layout, index) => {
                          const inserted = layout.item;
                          const needsApertureField =
                            inserted.type === "iris" || inserted.type === "filter" || inserted.type === "custom";
                          return (
                            <div key={inserted.id} className="rounded-lg border border-labBorder bg-[#090909] p-3">
                              <p className="mb-2 text-xs uppercase tracking-[0.12em] text-labMuted">
                                Insert {index + 1} · {inserted.type}
                              </p>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <Input
                                  label="Label"
                                  value={inserted.label}
                                  onChange={(event) =>
                                    updateSpacerInsertedItems(selectedItem.id, (items) =>
                                      items.map((entry) =>
                                        entry.id === inserted.id ? { ...entry, label: event.target.value } : entry
                                      )
                                    )
                                  }
                                />
                                <Select
                                  label="Position mode"
                                  value={inserted.positionMode}
                                  onChange={(event) =>
                                    updateSpacerInsertedItems(selectedItem.id, (items) =>
                                      items.map((entry) => {
                                        if (entry.id !== inserted.id) return entry;
                                        const nextMode = event.target.value as
                                          | "centered"
                                          | "distance_from_front"
                                          | "distance_from_rear"
                                          | "manual_split";
                                        if (nextMode === "manual_split") {
                                          return {
                                            ...entry,
                                            positionMode: nextMode,
                                            spacerBeforeMm:
                                              typeof entry.spacerBeforeMm === "number"
                                                ? entry.spacerBeforeMm
                                                : layout.spacerBeforeMm,
                                            spacerAfterMm:
                                              typeof entry.spacerAfterMm === "number"
                                                ? entry.spacerAfterMm
                                                : layout.spacerAfterMm
                                          };
                                        }
                                        return {
                                          ...entry,
                                          positionMode: nextMode
                                        };
                                      })
                                    )
                                  }
                                >
                                  {airspaceInsertedPositionModeOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </Select>
                                <NumberInput
                                  label="Disk diameter (mm)"
                                  value={inserted.diskDiameterMm ?? ""}
                                  min={0}
                                  step="0.01"
                                  onChange={(event) =>
                                    updateSpacerInsertedItems(selectedItem.id, (items) =>
                                      items.map((entry) =>
                                        entry.id === inserted.id
                                          ? {
                                              ...entry,
                                              diskDiameterMm: event.target.value
                                                ? Number(event.target.value)
                                                : undefined
                                            }
                                          : entry
                                      )
                                    )
                                  }
                                />
                                <NumberInput
                                  label="Thickness (mm)"
                                  value={inserted.thicknessMm}
                                  min={0}
                                  step="0.01"
                                  onChange={(event) =>
                                    updateSpacerInsertedItems(selectedItem.id, (items) =>
                                      items.map((entry) =>
                                        entry.id === inserted.id
                                          ? {
                                              ...entry,
                                              thicknessMm: Number(event.target.value)
                                            }
                                          : entry
                                      )
                                    )
                                  }
                                />
                                {needsApertureField && (
                                  <NumberInput
                                    label="Aperture diameter (mm)"
                                    value={inserted.apertureDiameterMm ?? ""}
                                    min={0}
                                    step="0.01"
                                    onChange={(event) =>
                                      updateSpacerInsertedItems(selectedItem.id, (items) =>
                                        items.map((entry) =>
                                          entry.id === inserted.id
                                            ? {
                                                ...entry,
                                                apertureDiameterMm: event.target.value
                                                  ? Number(event.target.value)
                                                  : undefined
                                              }
                                            : entry
                                        )
                                      )
                                    }
                                  />
                                )}
                                {inserted.positionMode === "distance_from_front" && (
                                  <NumberInput
                                    label="Distance from front (mm)"
                                    value={inserted.distanceFromFrontMm ?? ""}
                                    min={0}
                                    step="0.01"
                                    onChange={(event) =>
                                      updateSpacerInsertedItems(selectedItem.id, (items) =>
                                        items.map((entry) =>
                                          entry.id === inserted.id
                                            ? {
                                                ...entry,
                                                distanceFromFrontMm: event.target.value
                                                  ? Number(event.target.value)
                                                  : undefined
                                              }
                                            : entry
                                        )
                                      )
                                    }
                                  />
                                )}
                                {inserted.positionMode === "distance_from_rear" && (
                                  <NumberInput
                                    label="Distance from rear (mm)"
                                    value={inserted.distanceFromRearMm ?? ""}
                                    min={0}
                                    step="0.01"
                                    onChange={(event) =>
                                      updateSpacerInsertedItems(selectedItem.id, (items) =>
                                        items.map((entry) =>
                                          entry.id === inserted.id
                                            ? {
                                                ...entry,
                                                distanceFromRearMm: event.target.value
                                                  ? Number(event.target.value)
                                                  : undefined
                                              }
                                            : entry
                                        )
                                      )
                                    }
                                  />
                                )}
                                {inserted.positionMode === "manual_split" && (
                                  <>
                                    <NumberInput
                                      label="Spacer before (mm)"
                                      value={inserted.spacerBeforeMm ?? ""}
                                      min={0}
                                      step="0.01"
                                      onChange={(event) =>
                                        updateSpacerInsertedItems(selectedItem.id, (items) =>
                                          items.map((entry) =>
                                            entry.id === inserted.id
                                              ? {
                                                  ...entry,
                                                  spacerBeforeMm: event.target.value
                                                    ? Number(event.target.value)
                                                    : undefined
                                                }
                                              : entry
                                          )
                                        )
                                      }
                                    />
                                    <NumberInput
                                      label="Spacer after (mm)"
                                      value={inserted.spacerAfterMm ?? ""}
                                      min={0}
                                      step="0.01"
                                      onChange={(event) =>
                                        updateSpacerInsertedItems(selectedItem.id, (items) =>
                                          items.map((entry) =>
                                            entry.id === inserted.id
                                              ? {
                                                  ...entry,
                                                  spacerAfterMm: event.target.value
                                                    ? Number(event.target.value)
                                                    : undefined
                                                }
                                              : entry
                                          )
                                        )
                                      }
                                    />
                                  </>
                                )}
                              </div>
                              <div className="mt-2 rounded-md border border-labBorder bg-[#080808] px-2 py-2 text-xs">
                                <p className="text-labMuted">
                                  Calculated spacer before:{" "}
                                  <span className="mono text-labText">{layout.spacerBeforeMm.toFixed(3)} mm</span>
                                </p>
                                <p className="text-labMuted">
                                  Calculated spacer after:{" "}
                                  <span className="mono text-labText">{layout.spacerAfterMm.toFixed(3)} mm</span>
                                </p>
                                <p className="text-labMuted">
                                  Total check (before + insert + after):{" "}
                                  <span className="mono text-labText">{layout.totalMm.toFixed(3)} mm</span>
                                </p>
                              </div>
                              {layout.warnings.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {layout.warnings.map((warning, warningIndex) => (
                                    <p key={`${inserted.id}-warn-${warningIndex}`} className="text-xs text-labWarning">
                                      {warning}
                                    </p>
                                  ))}
                                </div>
                              )}
                              <div className="mt-3">
                                <Button
                                  type="button"
                                  variant="danger"
                                  className="w-full"
                                  onClick={() =>
                                    updateSpacerInsertedItems(selectedItem.id, (items) =>
                                      items.filter((entry) => entry.id !== inserted.id)
                                    )
                                  }
                                >
                                  Delete insert
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        className={`w-full ${selectedSpacerWorkingInsertedItems.length === 0 ? "sm:col-span-2" : ""}`}
                        onClick={() => applySpacerInsertedItems(selectedItem.id)}
                      >
                        Apply AirSpace Inserts
                      </Button>
                      {selectedSpacerWorkingInsertedItems.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="w-full"
                          onClick={() => updateSpacerInsertedItems(selectedItem.id, () => [])}
                        >
                          Clear all inserts
                        </Button>
                      )}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-labMuted">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedItem.hasAntiReflectionGrooves)}
                      onChange={(event) =>
                        updateTypedItem(selectedItem.id, "spacer", (entry) => ({
                          ...entry,
                          hasAntiReflectionGrooves: event.target.checked
                        }))
                      }
                    />
                    Anti-reflection grooves
                  </label>
                  <label className="flex items-center gap-2 text-sm text-labMuted">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedItem.chamferEnabled)}
                      onChange={(event) =>
                        updateTypedItem(selectedItem.id, "spacer", (entry) => ({
                          ...entry,
                          chamferEnabled: event.target.checked
                        }))
                      }
                    />
                    Chamfer enabled
                  </label>
                  {selectedItem.chamferEnabled && (
                    <NumberInput
                      label="Chamfer (mm)"
                      value={selectedItem.chamferMm ?? ""}
                      min={0}
                      onChange={(event) =>
                        updateTypedItem(selectedItem.id, "spacer", (entry) => ({
                          ...entry,
                          chamferMm: event.target.value ? Number(event.target.value) : undefined
                        }))
                      }
                    />
                  )}
                </>
              )}

              {selectedItem.type === "iris" && (
                <>
                  <NumberInput
                    label="Disk diameter (mm)"
                    value={selectedItem.diskDiameterMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "iris", (entry) => ({
                        ...entry,
                        diskDiameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Aperture diameter (mm)"
                    value={selectedItem.apertureDiameterMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "iris", (entry) => ({
                        ...entry,
                        apertureDiameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Thickness (mm)"
                    value={selectedItem.thicknessMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "iris", (entry) => ({
                        ...entry,
                        thicknessMm: Number(event.target.value)
                      }))
                    }
                  />
                  <label className="flex items-center gap-2 text-sm text-labMuted">
                    <input
                      type="checkbox"
                      checked={selectedItem.isOval}
                      onChange={(event) =>
                        updateTypedItem(selectedItem.id, "iris", (entry) => ({
                          ...entry,
                          isOval: event.target.checked
                        }))
                      }
                    />
                    Oval aperture
                  </label>
                  {selectedItem.isOval && (
                    <>
                      <NumberInput
                        label="Oval width (mm)"
                        value={selectedItem.ovalWidthMm ?? ""}
                        min={0}
                        onChange={(event) =>
                          updateTypedItem(selectedItem.id, "iris", (entry) => ({
                            ...entry,
                            ovalWidthMm: event.target.value ? Number(event.target.value) : undefined
                          }))
                        }
                      />
                      <NumberInput
                        label="Oval height (mm)"
                        value={selectedItem.ovalHeightMm ?? ""}
                        min={0}
                        onChange={(event) =>
                          updateTypedItem(selectedItem.id, "iris", (entry) => ({
                            ...entry,
                            ovalHeightMm: event.target.value ? Number(event.target.value) : undefined
                          }))
                        }
                      />
                    </>
                  )}
                  <label className="flex items-center gap-2 text-sm text-labMuted">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedItem.tabEnabled)}
                      onChange={(event) =>
                        updateTypedItem(selectedItem.id, "iris", (entry) => ({
                          ...entry,
                          tabEnabled: event.target.checked
                        }))
                      }
                    />
                    Add tab
                  </label>
                  {selectedItem.tabEnabled && (
                    <>
                      <NumberInput
                        label="Tab width (mm)"
                        value={selectedItem.tabWidthMm ?? ""}
                        min={0}
                        onChange={(event) =>
                          updateTypedItem(selectedItem.id, "iris", (entry) => ({
                            ...entry,
                            tabWidthMm: event.target.value ? Number(event.target.value) : undefined
                          }))
                        }
                      />
                      <NumberInput
                        label="Tab length (mm)"
                        value={selectedItem.tabLengthMm ?? ""}
                        min={0}
                        onChange={(event) =>
                          updateTypedItem(selectedItem.id, "iris", (entry) => ({
                            ...entry,
                            tabLengthMm: event.target.value ? Number(event.target.value) : undefined
                          }))
                        }
                      />
                    </>
                  )}
                </>
              )}

              {selectedItem.type === "diffusion" && (
                <>
                  <NumberInput
                    label="Disk diameter (mm)"
                    value={selectedItem.diskDiameterMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "diffusion", (entry) => ({
                        ...entry,
                        diskDiameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Clear center diameter (mm)"
                    value={selectedItem.clearCenterDiameterMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "diffusion", (entry) => ({
                        ...entry,
                        clearCenterDiameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Diffusion outer diameter (mm)"
                    value={selectedItem.diffusionOuterDiameterMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "diffusion", (entry) => ({
                        ...entry,
                        diffusionOuterDiameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Thickness (mm)"
                    value={selectedItem.thicknessMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "diffusion", (entry) => ({
                        ...entry,
                        thicknessMm: Number(event.target.value)
                      }))
                    }
                  />
                </>
              )}

              {selectedItem.type === "mount" && (
                <>
                  <Select
                    label="Mount type"
                    value={selectedItem.mountType}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "mount", (entry) => ({
                        ...entry,
                        mountType: event.target.value as typeof selectedItem.mountType
                      }))
                    }
                  >
                    <option value="PL">PL</option>
                    <option value="LPL">LPL</option>
                    <option value="EF">EF</option>
                    <option value="E">E</option>
                    <option value="M42">M42</option>
                    <option value="CUSTOM">CUSTOM</option>
                  </Select>
                  <NumberInput
                    label="Flange distance (mm)"
                    value={selectedItem.flangeDistanceMm ?? ""}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "mount", (entry) => ({
                        ...entry,
                        flangeDistanceMm: event.target.value ? Number(event.target.value) : undefined
                      }))
                    }
                  />
                  <NumberInput
                    label="Inner clearance (mm)"
                    value={selectedItem.innerClearanceMm ?? ""}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "mount", (entry) => ({
                        ...entry,
                        innerClearanceMm: event.target.value ? Number(event.target.value) : undefined
                      }))
                    }
                  />
                </>
              )}

              {selectedItem.type === "barrel" && (
                <>
                  <label className="flex items-center gap-2 text-sm text-labMuted">
                    <input
                      type="checkbox"
                      checked={selectedItem.autoFitToStack !== false}
                      onChange={(event) =>
                        updateTypedItem(selectedItem.id, "barrel", (entry) => ({
                          ...entry,
                          autoFitToStack: event.target.checked
                        }))
                      }
                    />
                    Auto-fit to largest stack element (recommended)
                  </label>
                  {selectedItem.autoFitToStack !== false && (
                    <Button
                      variant="ghost"
                      className="w-full text-xs"
                      onClick={() => autoFitBarrel(selectedItem.id)}
                    >
                      Recalculate barrel auto-fit now
                    </Button>
                  )}
                  <NumberInput
                    label="Inner diameter (mm)"
                    value={selectedItem.innerDiameterMm}
                    min={0}
                    disabled={selectedItem.autoFitToStack !== false}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "barrel", (entry) => ({
                        ...entry,
                        innerDiameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Outer diameter (mm)"
                    value={selectedItem.outerDiameterMm}
                    min={0}
                    disabled={selectedItem.autoFitToStack !== false}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "barrel", (entry) => ({
                        ...entry,
                        outerDiameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Length (mm)"
                    value={selectedItem.lengthMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "barrel", (entry) => ({
                        ...entry,
                        lengthMm: Number(event.target.value)
                      }))
                    }
                  />
                </>
              )}

              {selectedItem.type === "retaining_ring" && (
                <>
                  <label className="flex items-center gap-2 text-sm text-labMuted">
                    <input
                      type="checkbox"
                      checked={selectedItem.autoFitToBarrel !== false}
                      onChange={(event) =>
                        updateTypedItem(selectedItem.id, "retaining_ring", (entry) => ({
                          ...entry,
                          autoFitToBarrel: event.target.checked
                        }))
                      }
                    />
                    Auto-fit diameters to barrel (recommended)
                  </label>
                  {selectedItem.autoFitToBarrel !== false && (
                    <Button
                      variant="ghost"
                      className="w-full text-xs"
                      onClick={() => autoFitRetainingRing(selectedItem.id)}
                    >
                      Recalculate auto-fit now
                    </Button>
                  )}
                  <NumberInput
                    label="Inner diameter (mm)"
                    value={selectedItem.innerDiameterMm}
                    min={0}
                    disabled={selectedItem.autoFitToBarrel !== false}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "retaining_ring", (entry) => ({
                        ...entry,
                        innerDiameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Outer diameter (mm)"
                    value={selectedItem.outerDiameterMm}
                    min={0}
                    disabled={selectedItem.autoFitToBarrel !== false}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "retaining_ring", (entry) => ({
                        ...entry,
                        outerDiameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Thickness (mm)"
                    value={selectedItem.thicknessMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "retaining_ring", (entry) => ({
                        ...entry,
                        thicknessMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Notch count"
                    value={selectedItem.notchCount ?? ""}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "retaining_ring", (entry) => ({
                        ...entry,
                        notchCount: event.target.value ? Number(event.target.value) : undefined
                      }))
                    }
                  />
                </>
              )}

              {selectedItem.type === "custom" && (
                <>
                  <NumberInput
                    label="Length (mm)"
                    value={selectedItem.lengthMm ?? ""}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "custom", (entry) => ({
                        ...entry,
                        lengthMm: event.target.value ? Number(event.target.value) : undefined
                      }))
                    }
                  />
                  <NumberInput
                    label="Diameter (mm)"
                    value={selectedItem.diameterMm ?? ""}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "custom", (entry) => ({
                        ...entry,
                        diameterMm: event.target.value ? Number(event.target.value) : undefined
                      }))
                    }
                  />
                </>
              )}

              <WarningBox title="Inline Validation" lines={selectedErrors} />
              {selectedSpacer && selectedSpacerInsertedWarnings.length > 0 && (
                <WarningBox title="AirSpace Insert Warnings" lines={selectedSpacerInsertedWarnings} />
              )}
              {selectedGlass && <WarningBox title="Advanced Physical Profile Warnings" lines={selectedAdvancedWarnings} />}
            </div>
          )}
          <div className="mt-4 border-t border-labBorder pt-3">
            <Button variant="primary" onClick={() => selectedItem && duplicateItem(selectedItem.id)}>
              Duplicate item
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
