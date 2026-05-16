export type LensMountType =
  | "M42"
  | "EF"
  | "PL"
  | "LPL"
  | "E"
  | "NIKON_F"
  | "LEICA_M"
  | "CUSTOM";

export type RearCarrierOuterDiameterSource =
  | "auto_fit_system"
  | "sliding_carrier_part"
  | "manual"
  | "unknown";

export type TargetMountThroatDiameterSource = "mount_preset" | "manual" | "unknown";

export type FocusTravelMovingCarrierPreset = {
  travelMm: number;
  actualFocusTravelMm?: number;
  recommendedSlotLengthMm?: number;
  slotMechanicalClearanceMm?: number;
  rearCarrierOuterDiameterMm?: number;
  rearCarrierOuterDiameterSource?: RearCarrierOuterDiameterSource;
  sourceSummary?: string;
  createdAt: string;
};

export type FocusTravelSetup = {
  originalMount: LensMountType;
  originalFlangeDistanceMm: number;
  targetMount: LensMountType;
  targetFlangeDistanceMm: number;

  referencePointLabel: string;
  donorFlangeToReferenceInfinityMm?: number;
  donorFlangeToReferenceCloseFocusMm?: number;

  infinityOvertravelMm: number;
  closeFocusExtraMarginMm: number;

  targetMountThroatDiameterMm?: number;
  targetMountThroatDiameterSource?: TargetMountThroatDiameterSource;
  rearCarrierOuterDiameterMm?: number;
  rearCarrierOuterDiameterSource?: RearCarrierOuterDiameterSource;
  rearCarrierOuterDiameterManualOverride?: boolean;

  actualFocusTravelMm?: number;
  recommendedPrototypeTravelMm?: number;
  slotMechanicalClearanceMm?: number;
  recommendedSlotLengthMm?: number;

  notes?: string;
  movingCarrierCadPreset?: FocusTravelMovingCarrierPreset;
};
