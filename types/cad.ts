export type CadDefaults = {
  printToleranceMm: number;
  radialClearanceMm: number;
  wallThicknessMm: number;
  retainingLipMm: number;
  partThicknessMm: number;
  screwDiameterMm: number;
  camPinDiameterMm: number;
  camSlotClearanceMm: number;
  defaultOuterDiameterMm: number;
  defaultInnerDiameterMm: number;
  facets: number;
};

export type ElementCupParams = {
  partName: string;
  glassDiameterMm: number;
  glassThicknessMm: number;
  profileSegments?: Array<{
    name?: string;
    diameterMm: number;
    depthMm: number;
  }>;
  seatClearanceMm: number;
  wallThicknessMm: number;
  retainingLipMm: number;
  rearLipMm: number;
  cupDepthMm?: number;
  outerDiameterMm?: number;
  facets: number;
};

export type SpacerRingParams = {
  partName: string;
  innerDiameterMm: number;
  outerDiameterMm: number;
  thicknessMm: number;
  hasAntiReflectionGrooves: boolean;
  chamferEnabled?: boolean;
  chamferMm?: number;
  facets: number;
};

export type IrisDiskParams = {
  partName: string;
  diskDiameterMm: number;
  apertureDiameterMm: number;
  thicknessMm: number;
  isOval: boolean;
  ovalWidthMm?: number;
  ovalHeightMm?: number;
  tabEnabled?: boolean;
  tabWidthMm?: number;
  tabLengthMm?: number;
  facets: number;
};

export type DiffusionHolderParams = {
  partName: string;
  diskDiameterMm: number;
  clearCenterDiameterMm: number;
  diffusionOuterDiameterMm: number;
  holderThicknessMm: number;
  wallThicknessMm: number;
  retainingLipMm: number;
  facets: number;
};

export type RetainingRingParams = {
  partName: string;
  innerDiameterMm: number;
  outerDiameterMm: number;
  thicknessMm: number;
  notchCount: number;
  notchWidthMm: number;
  notchDepthMm: number;
  facets: number;
};

export type MainBarrelParams = {
  partName: string;
  innerDiameterMm: number;
  outerDiameterMm: number;
  lengthMm: number;
  hasIrisSlot: boolean;
  hasDiffusionSlot: boolean;
  slotWidthMm: number;
  slotLengthMm: number;
  screwHoleCount: number;
  screwDiameterMm: number;
  facets: number;
};

export type MovingCarrierParams = {
  partName: string;
  innerDiameterMm: number;
  outerDiameterMm: number;
  lengthMm: number;
  camPinDiameterMm: number;
  antiRotationKeyEnabled: boolean;
  facets: number;
};

export type CamSleeveParams = {
  partName: string;
  innerDiameterMm: number;
  outerDiameterMm: number;
  lengthMm: number;
  rotationDegrees: number;
  axialTravelMm: number;
  slotWidthMm: number;
  facets: number;
};
