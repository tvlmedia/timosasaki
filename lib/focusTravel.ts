import { getLargestGlassDiameter } from "@/lib/calculations";
import type {
  FocusTravelSetup,
  LensMountType,
  LensProject,
  RearCarrierOuterDiameterSource,
  TargetMountThroatDiameterSource
} from "@/types";

export const MOUNT_FLANGE_DEFAULTS_MM: Record<Exclude<LensMountType, "CUSTOM">, number> = {
  M42: 45.46,
  EF: 44.0,
  PL: 52.0,
  LPL: 44.0,
  E: 18.0,
  NIKON_F: 46.5,
  LEICA_M: 27.8
};

const DEFAULT_PL_MOUNT_THROAT_PRESET_MM = 54.0;
const DEFAULT_MINIMUM_CUP_WALL_THICKNESS_MM = 2.0;
const DEFAULT_SHARED_STACK_ROUNDING_INCREMENT_MM = 0.5;
const DEFAULT_CUP_TO_CARRIER_CLEARANCE_MM = 0.6;
const DEFAULT_CARRIER_WALL_THICKNESS_MM = 2.0;
const DEFAULT_SLOT_MECHANICAL_CLEARANCE_MM = 0.0;

function toFinitePositive(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

function toPositiveOrFallback(value: unknown, fallback: number): number {
  const positive = toFinitePositive(value);
  return positive ?? fallback;
}

function roundUpToIncrement(value: number, increment: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(increment) || increment <= 0) return value;
  return Math.ceil(value / increment) * increment;
}

function resolveDefaultFlangeDistance(mount: LensMountType, fallback: number): number {
  if (mount === "CUSTOM") return fallback;
  return MOUNT_FLANGE_DEFAULTS_MM[mount];
}

function normalizeTargetMountThroatDiameterSource(
  source: unknown,
  hasThroatValue: boolean
): TargetMountThroatDiameterSource {
  if (!hasThroatValue) return "unknown";
  if (source === "mount_preset" || source === "manual") return source;
  return "unknown";
}

function normalizeRearCarrierOuterDiameterSource(
  source: unknown,
  hasRearCarrierValue: boolean
): RearCarrierOuterDiameterSource {
  if (!hasRearCarrierValue) return "unknown";
  if (
    source === "auto_fit_system" ||
    source === "sliding_carrier_part" ||
    source === "manual"
  ) {
    return source;
  }
  return "unknown";
}

export function getMountThroatPresetMm(mount: LensMountType): number | undefined {
  if (mount === "PL") return DEFAULT_PL_MOUNT_THROAT_PRESET_MM;
  return undefined;
}

export function defaultFocusTravelSetup(): FocusTravelSetup {
  return {
    originalMount: "M42",
    originalFlangeDistanceMm: MOUNT_FLANGE_DEFAULTS_MM.M42,
    targetMount: "PL",
    targetFlangeDistanceMm: MOUNT_FLANGE_DEFAULTS_MM.PL,
    referencePointLabel: "Back of rear group",
    infinityOvertravelMm: 10,
    closeFocusExtraMarginMm: 5,
    targetMountThroatDiameterSource: "unknown",
    rearCarrierOuterDiameterSource: "unknown",
    rearCarrierOuterDiameterManualOverride: false,
    slotMechanicalClearanceMm: DEFAULT_SLOT_MECHANICAL_CLEARANCE_MM
  };
}

export function normalizeFocusTravelSetup(value: FocusTravelSetup | undefined): FocusTravelSetup {
  const defaults = defaultFocusTravelSetup();
  if (!value) return defaults;

  const originalMount = value.originalMount ?? defaults.originalMount;
  const targetMount = value.targetMount ?? defaults.targetMount;

  const originalDefault = resolveDefaultFlangeDistance(originalMount, defaults.originalFlangeDistanceMm);
  const targetDefault = resolveDefaultFlangeDistance(targetMount, defaults.targetFlangeDistanceMm);

  const targetMountThroatDiameterMm = toFinitePositive(value.targetMountThroatDiameterMm);
  const rearCarrierOuterDiameterMm = toFinitePositive(value.rearCarrierOuterDiameterMm);

  return {
    ...defaults,
    ...value,
    originalMount,
    targetMount,
    originalFlangeDistanceMm: toPositiveOrFallback(value.originalFlangeDistanceMm, originalDefault),
    targetFlangeDistanceMm: toPositiveOrFallback(value.targetFlangeDistanceMm, targetDefault),
    infinityOvertravelMm: Math.max(0, Number(value.infinityOvertravelMm ?? defaults.infinityOvertravelMm)),
    closeFocusExtraMarginMm: Math.max(
      0,
      Number(value.closeFocusExtraMarginMm ?? defaults.closeFocusExtraMarginMm)
    ),
    donorFlangeToReferenceInfinityMm: toFinitePositive(value.donorFlangeToReferenceInfinityMm),
    donorFlangeToReferenceCloseFocusMm: toFinitePositive(value.donorFlangeToReferenceCloseFocusMm),
    targetMountThroatDiameterMm,
    targetMountThroatDiameterSource: normalizeTargetMountThroatDiameterSource(
      value.targetMountThroatDiameterSource,
      Boolean(targetMountThroatDiameterMm)
    ),
    rearCarrierOuterDiameterMm,
    rearCarrierOuterDiameterSource: normalizeRearCarrierOuterDiameterSource(
      value.rearCarrierOuterDiameterSource,
      Boolean(rearCarrierOuterDiameterMm)
    ),
    rearCarrierOuterDiameterManualOverride: Boolean(value.rearCarrierOuterDiameterManualOverride),
    actualFocusTravelMm:
      typeof value.actualFocusTravelMm === "number" && Number.isFinite(value.actualFocusTravelMm)
        ? Math.max(0, value.actualFocusTravelMm)
        : undefined,
    recommendedPrototypeTravelMm: toFinitePositive(value.recommendedPrototypeTravelMm),
    slotMechanicalClearanceMm:
      typeof value.slotMechanicalClearanceMm === "number" && Number.isFinite(value.slotMechanicalClearanceMm)
        ? Math.max(0, value.slotMechanicalClearanceMm)
        : defaults.slotMechanicalClearanceMm,
    recommendedSlotLengthMm: toFinitePositive(value.recommendedSlotLengthMm),
    referencePointLabel: value.referencePointLabel?.trim() || defaults.referencePointLabel
  };
}

type DerivedAutoFitCarrierOuterDiameter = {
  carrierOuterDiameterMm?: number;
  source: "derived_auto_fit" | "stack_auto_fit_summary" | "unavailable";
};

function deriveAutoFitCarrierOuterDiameter(project: LensProject): DerivedAutoFitCarrierOuterDiameter {
  const largestGlassDiameterMm = getLargestGlassDiameter(project.stackItems);
  const manualTargetStackOuterDiameterMm = toFinitePositive(project.cadDefaults.targetStackOuterDiameterMm);
  const targetStackOuterDiameterMm =
    manualTargetStackOuterDiameterMm ??
    (largestGlassDiameterMm > 0
      ? roundUpToIncrement(
          Math.max(4, largestGlassDiameterMm + DEFAULT_MINIMUM_CUP_WALL_THICKNESS_MM * 2),
          DEFAULT_SHARED_STACK_ROUNDING_INCREMENT_MM
        )
      : undefined);

  const carrierInnerDiameterMm =
    toFinitePositive(project.cadDefaults.carrierInnerDiameterMm) ??
    (targetStackOuterDiameterMm
      ? targetStackOuterDiameterMm + (toFinitePositive(project.cadDefaults.cupToCarrierClearanceMm) ?? DEFAULT_CUP_TO_CARRIER_CLEARANCE_MM)
      : undefined);
  const carrierWallThicknessMm =
    toFinitePositive(project.cadDefaults.carrierWallThicknessMm) ?? DEFAULT_CARRIER_WALL_THICKNESS_MM;

  if (!carrierInnerDiameterMm || carrierInnerDiameterMm <= 0) {
    return {
      source: "unavailable"
    };
  }

  return {
    carrierOuterDiameterMm: Number((carrierInnerDiameterMm + carrierWallThicknessMm * 2).toFixed(3)),
    source: "derived_auto_fit"
  };
}

function deriveStackSummaryCarrierOuterDiameter(project: LensProject): number | undefined {
  const spacerOuterDiameters = project.stackItems
    .filter((item): item is Extract<LensProject["stackItems"][number], { type: "spacer" }> => item.type === "spacer")
    .map((spacer) => toFinitePositive(spacer.outerDiameterMm))
    .filter((diameter): diameter is number => typeof diameter === "number" && diameter > 0);

  const stackOuterDiameterMm = spacerOuterDiameters.length ? Math.max(...spacerOuterDiameters) : undefined;
  if (!stackOuterDiameterMm) return undefined;

  const carrierInnerDiameterMm =
    toFinitePositive(project.cadDefaults.carrierInnerDiameterMm) ??
    Number((stackOuterDiameterMm + (toFinitePositive(project.cadDefaults.cupToCarrierClearanceMm) ?? DEFAULT_CUP_TO_CARRIER_CLEARANCE_MM)).toFixed(3));
  const carrierWallThicknessMm =
    toFinitePositive(project.cadDefaults.carrierWallThicknessMm) ?? DEFAULT_CARRIER_WALL_THICKNESS_MM;
  return Number((carrierInnerDiameterMm + carrierWallThicknessMm * 2).toFixed(3));
}

function getSlidingCarrierPartCarrierOuterDiameter(project: LensProject): number | undefined {
  const slidingCarrierPart = (project.mechanicalParts ?? []).find((part) => part.type === "sliding_optical_carrier");
  return toFinitePositive(slidingCarrierPart?.outerDiameterMm);
}

export function resolveRearCarrierOuterDiameterForFocus(
  project: LensProject,
  setup: FocusTravelSetup
): {
  valueMm?: number;
  source: RearCarrierOuterDiameterSource;
  sourceLabel: string;
} {
  if (setup.rearCarrierOuterDiameterManualOverride) {
    const manual = toFinitePositive(setup.rearCarrierOuterDiameterMm);
    return {
      valueMm: manual,
      source: manual ? "manual" : "unknown",
      sourceLabel: manual ? "Manual override" : "Manual override (value missing)"
    };
  }

  const derivedAutoFit = deriveAutoFitCarrierOuterDiameter(project);
  if (derivedAutoFit.source === "derived_auto_fit" && derivedAutoFit.carrierOuterDiameterMm) {
    return {
      valueMm: derivedAutoFit.carrierOuterDiameterMm,
      source: "auto_fit_system",
      sourceLabel: "Auto-fit System carrier_outer_diameter"
    };
  }

  const stackSummary = deriveStackSummaryCarrierOuterDiameter(project);
  if (stackSummary) {
    return {
      valueMm: stackSummary,
      source: "auto_fit_system",
      sourceLabel: "Stack auto-fit summary carrier_outer_diameter"
    };
  }

  const slidingCarrierPartOuterDiameterMm = getSlidingCarrierPartCarrierOuterDiameter(project);
  if (slidingCarrierPartOuterDiameterMm) {
    return {
      valueMm: slidingCarrierPartOuterDiameterMm,
      source: "sliding_carrier_part",
      sourceLabel: "Sliding optical carrier CAD part"
    };
  }

  const manualFallback = toFinitePositive(setup.rearCarrierOuterDiameterMm);
  if (manualFallback) {
    return {
      valueMm: manualFallback,
      source: "manual",
      sourceLabel: "Manual fallback"
    };
  }

  return {
    source: "unknown",
    sourceLabel: "Unavailable"
  };
}

export type FocusTravelCalculated = {
  targetOffsetMm: number;
  targetPositionInfinityMm?: number;
  targetPositionCloseFocusMm?: number;
  actualFocusTravelMm?: number;
  directionHint?: string;
  prototypeStartMm?: number;
  prototypeEndMm?: number;
  recommendedPrototypeTravelMm?: number;
  recommendedSlotLengthMm?: number;
  recommendedMaxRearCarrierODMm?: number;
  warnings: string[];
};

export function calculateFocusTravel(setup: FocusTravelSetup): FocusTravelCalculated {
  const targetOffsetMm = setup.targetFlangeDistanceMm - setup.originalFlangeDistanceMm;
  const warnings: string[] = [];

  const hasInfinity =
    typeof setup.donorFlangeToReferenceInfinityMm === "number" &&
    Number.isFinite(setup.donorFlangeToReferenceInfinityMm) &&
    setup.donorFlangeToReferenceInfinityMm > 0;
  const hasClose =
    typeof setup.donorFlangeToReferenceCloseFocusMm === "number" &&
    Number.isFinite(setup.donorFlangeToReferenceCloseFocusMm) &&
    setup.donorFlangeToReferenceCloseFocusMm > 0;

  if (!hasInfinity || !hasClose) {
    warnings.push("Enter valid positive infinity and close-focus measurements to calculate focus travel.");
    return {
      targetOffsetMm,
      warnings
    };
  }

  const donorInfinityMm = setup.donorFlangeToReferenceInfinityMm as number;
  const donorCloseMm = setup.donorFlangeToReferenceCloseFocusMm as number;
  const targetPositionInfinityMm = donorInfinityMm - targetOffsetMm;
  const targetPositionCloseFocusMm = donorCloseMm - targetOffsetMm;
  const actualFocusTravelMm = Math.abs(donorInfinityMm - donorCloseMm);
  const recommendedPrototypeTravelMm =
    actualFocusTravelMm + setup.infinityOvertravelMm + setup.closeFocusExtraMarginMm;
  const slotMechanicalClearanceMm = Math.max(0, setup.slotMechanicalClearanceMm ?? DEFAULT_SLOT_MECHANICAL_CLEARANCE_MM);
  const recommendedSlotLengthMm = recommendedPrototypeTravelMm + slotMechanicalClearanceMm;
  const directionSign = donorCloseMm - donorInfinityMm;
  const directionHint =
    directionSign < 0
      ? "Close focus moves the reference point toward the donor flange / sensor side in this measurement convention."
      : directionSign > 0
        ? "Close focus moves the reference point away from the donor flange / toward the front in this measurement convention."
        : undefined;

  if (actualFocusTravelMm === 0) {
    warnings.push("Infinity and close-focus measurements are equal, so measured focus travel is 0mm.");
  }

  const motionDirectionUnit = directionSign < 0 ? -1 : 1;
  const sensorSideBeyondInfinityMm = setup.infinityOvertravelMm;
  const frontSideBeyondCloseMm = setup.closeFocusExtraMarginMm;
  const prototypeStartMm = targetPositionInfinityMm + motionDirectionUnit * sensorSideBeyondInfinityMm;
  const prototypeEndMm = targetPositionCloseFocusMm - motionDirectionUnit * frontSideBeyondCloseMm;

  if (Math.min(prototypeStartMm, prototypeEndMm) < 0) {
    warnings.push(
      "Carrier may need to move behind the target flange plane. Check target mount throat clearance."
    );
  }

  const recommendedMaxRearCarrierODMm =
    typeof setup.targetMountThroatDiameterMm === "number" && setup.targetMountThroatDiameterMm > 0
      ? setup.targetMountThroatDiameterMm - 1
      : undefined;

  if (!recommendedMaxRearCarrierODMm) {
    warnings.push("Measure actual PL throat diameter before finalizing rear carrier size.");
  } else if (
    typeof setup.rearCarrierOuterDiameterMm === "number" &&
    setup.rearCarrierOuterDiameterMm > recommendedMaxRearCarrierODMm
  ) {
    warnings.push("Rear carrier may collide with mount throat. Reduce rear carrier OD or measure real mount clearance.");
  }

  if (recommendedPrototypeTravelMm <= 0) {
    warnings.push("Recommended prototype travel is not positive. Re-check donor measurements and margins.");
  }

  return {
    targetOffsetMm,
    targetPositionInfinityMm,
    targetPositionCloseFocusMm,
    actualFocusTravelMm,
    directionHint,
    prototypeStartMm,
    prototypeEndMm,
    recommendedPrototypeTravelMm,
    recommendedSlotLengthMm,
    recommendedMaxRearCarrierODMm,
    warnings
  };
}

export function getDefaultFlangeForMount(mount: LensMountType): number | undefined {
  if (mount === "CUSTOM") return undefined;
  return MOUNT_FLANGE_DEFAULTS_MM[mount];
}
