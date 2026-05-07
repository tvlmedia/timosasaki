export type LensMountType =
  | "M42"
  | "EF"
  | "PL"
  | "LPL"
  | "E"
  | "NIKON_F"
  | "LEICA_M"
  | "CUSTOM";

export type FocusTravelMovingCarrierPreset = {
  travelMm: number;
  rearCarrierOuterDiameterMm?: number;
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
  rearCarrierOuterDiameterMm?: number;

  notes?: string;
  movingCarrierCadPreset?: FocusTravelMovingCarrierPreset;
};
