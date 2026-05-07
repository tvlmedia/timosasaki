import type { FocusTravelSetup, LensMountType } from "@/types";

export const MOUNT_FLANGE_DEFAULTS_MM: Record<Exclude<LensMountType, "CUSTOM">, number> = {
  M42: 45.46,
  EF: 44.0,
  PL: 52.0,
  LPL: 44.0,
  E: 18.0,
  NIKON_F: 46.5,
  LEICA_M: 27.8
};

export function defaultFocusTravelSetup(): FocusTravelSetup {
  return {
    originalMount: "M42",
    originalFlangeDistanceMm: MOUNT_FLANGE_DEFAULTS_MM.M42,
    targetMount: "PL",
    targetFlangeDistanceMm: MOUNT_FLANGE_DEFAULTS_MM.PL,
    referencePointLabel: "Back of rear group",
    infinityOvertravelMm: 10,
    closeFocusExtraMarginMm: 5
  };
}

function toPositiveOrFallback(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function resolveDefaultFlangeDistance(mount: LensMountType, fallback: number): number {
  if (mount === "CUSTOM") return fallback;
  return MOUNT_FLANGE_DEFAULTS_MM[mount];
}

export function normalizeFocusTravelSetup(value: FocusTravelSetup | undefined): FocusTravelSetup {
  const defaults = defaultFocusTravelSetup();
  if (!value) return defaults;

  const originalMount = value.originalMount ?? defaults.originalMount;
  const targetMount = value.targetMount ?? defaults.targetMount;

  const originalDefault = resolveDefaultFlangeDistance(originalMount, defaults.originalFlangeDistanceMm);
  const targetDefault = resolveDefaultFlangeDistance(targetMount, defaults.targetFlangeDistanceMm);

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
    donorFlangeToReferenceInfinityMm:
      typeof value.donorFlangeToReferenceInfinityMm === "number" &&
      Number.isFinite(value.donorFlangeToReferenceInfinityMm) &&
      value.donorFlangeToReferenceInfinityMm > 0
        ? value.donorFlangeToReferenceInfinityMm
        : undefined,
    donorFlangeToReferenceCloseFocusMm:
      typeof value.donorFlangeToReferenceCloseFocusMm === "number" &&
      Number.isFinite(value.donorFlangeToReferenceCloseFocusMm) &&
      value.donorFlangeToReferenceCloseFocusMm > 0
        ? value.donorFlangeToReferenceCloseFocusMm
        : undefined,
    targetMountThroatDiameterMm:
      typeof value.targetMountThroatDiameterMm === "number" &&
      Number.isFinite(value.targetMountThroatDiameterMm) &&
      value.targetMountThroatDiameterMm > 0
        ? value.targetMountThroatDiameterMm
        : undefined,
    rearCarrierOuterDiameterMm:
      typeof value.rearCarrierOuterDiameterMm === "number" &&
      Number.isFinite(value.rearCarrierOuterDiameterMm) &&
      value.rearCarrierOuterDiameterMm > 0
        ? value.rearCarrierOuterDiameterMm
        : undefined,
    referencePointLabel: value.referencePointLabel?.trim() || defaults.referencePointLabel
  };
}

export type FocusTravelCalculated = {
  targetOffsetMm: number;
  targetPositionInfinityMm?: number;
  targetPositionCloseFocusMm?: number;
  actualFocusTravelMm?: number;
  prototypeStartMm?: number;
  prototypeEndMm?: number;
  recommendedPrototypeTravelMm?: number;
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
    return {
      targetOffsetMm,
      warnings
    };
  }

  const targetPositionInfinityMm = setup.donorFlangeToReferenceInfinityMm! - targetOffsetMm;
  const targetPositionCloseFocusMm = setup.donorFlangeToReferenceCloseFocusMm! - targetOffsetMm;
  const actualFocusTravelMm = Math.abs(targetPositionCloseFocusMm - targetPositionInfinityMm);
  const prototypeStartMm = targetPositionInfinityMm - setup.infinityOvertravelMm;
  const prototypeEndMm = targetPositionCloseFocusMm + setup.closeFocusExtraMarginMm;
  const recommendedPrototypeTravelMm = prototypeEndMm - prototypeStartMm;

  if (setup.donorFlangeToReferenceCloseFocusMm! < setup.donorFlangeToReferenceInfinityMm!) {
    warnings.push(
      "Close focus measurement is smaller than infinity measurement. Check measurement direction/reference point."
    );
  }

  if (prototypeStartMm < 0) {
    warnings.push(
      "Carrier may need to move behind the target flange plane. Check target mount throat clearance."
    );
  }

  const recommendedMaxRearCarrierODMm =
    typeof setup.targetMountThroatDiameterMm === "number" && setup.targetMountThroatDiameterMm > 0
      ? setup.targetMountThroatDiameterMm - 1
      : undefined;

  if (!recommendedMaxRearCarrierODMm) {
    warnings.push("Measure your actual PL mount throat diameter before finalizing rear carrier size.");
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
    prototypeStartMm,
    prototypeEndMm,
    recommendedPrototypeTravelMm,
    recommendedMaxRearCarrierODMm,
    warnings
  };
}

export function getDefaultFlangeForMount(mount: LensMountType): number | undefined {
  if (mount === "CUSTOM") return undefined;
  return MOUNT_FLANGE_DEFAULTS_MM[mount];
}

