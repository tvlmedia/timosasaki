import type { StepDirection } from "@/types/measurement";

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
  plStepReferencePath?: string;
  plRearNeckOuterDiameterMm?: number;
  plRearNeckInnerDiameterMm?: number;
  plRearNeckLengthMm?: number;
  plLockingClearanceLengthMm?: number;
  plLockingClearanceDiameterMm?: number;
  plMainBarrelOuterDiameterMm?: number;
  plMainBarrelInnerDiameterMm?: number;
  plMainBarrelLengthMm?: number;
  plStepUpStartFromFlangeMm?: number;
  plSlotCount?: number;
  plSlotAngleOffsetDeg?: number;
  plSlotLengthManualMm?: number;
  plSlotStartZMm?: number;
  plPinDiameterMm?: number;
  plPinClearanceMm?: number;
  plAssemblyIncludeMainBarrelSection?: boolean;
  plAssemblyIncludeMovingCarrier?: boolean;
  plAssemblyIncludeGuidePins?: boolean;
  plAssemblyFuseBarrelToPl?: boolean;
};

export type SteppedCupProfile = {
  largeDiameterMm: number;
  smallDiameterMm: number;
  largeSectionThicknessMm: number;
  smallSectionThicknessMm: number;
  stepDirection: StepDirection;
};

export type ElementCupParams = {
  partName: string;
  glassDiameterMm: number;
  glassThicknessMm: number;
  steppedProfile?: SteppedCupProfile;
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

export type FixedPLBarrelWithSlotsParams = {
  partName: string;
  innerDiameterMm: number;
  outerDiameterMm: number;
  lengthMm: number;
  rearNeckOuterDiameterMm: number;
  rearNeckInnerDiameterMm: number;
  rearNeckLengthMm: number;
  mainBarrelOuterDiameterMm: number;
  mainBarrelInnerDiameterMm: number;
  mainBarrelLengthMm: number;
  plLockingClearanceLengthMm: number;
  plLockingClearanceDiameterMm?: number;
  stepUpStartFromPLFlangeMm: number;
  slotCount: number;
  slotAngleOffsetDeg: number;
  slotLengthMm: number;
  slotWidthMm: number;
  slotStartZMm: number;
  slotCenterRadiusMm?: number;
  pinDiameterMm: number;
  pinClearanceMm: number;
  facets: number;
};

export type SlidingOpticalCarrierParams = {
  partName: string;
  innerDiameterMm: number;
  outerDiameterMm: number;
  lengthMm: number;
  startZMm?: number;
  pinHoleCount: number;
  pinHoleAngleOffsetDeg: number;
  pinHoleDiameterMm: number;
  pinHoleZMm: number;
  addPinBosses: boolean;
  pinBossDiameterMm?: number;
  pinBossHeightMm?: number;
  facets: number;
};

export type SlidingFocusAssemblyMacroParams = {
  partName: string;
  plStepReferencePath: string;
  fixedBarrel: FixedPLBarrelWithSlotsParams;
  slidingCarrier: SlidingOpticalCarrierParams;
  includeMainBarrelSection: boolean;
  includeSlidingCarrier: boolean;
  includeGuidePins: boolean;
  guidePinDiameterMm: number;
  guidePinLengthMm: number;
  fuseBarrelToPl: boolean;
  focusPrototypeStartMm?: number;
  recommendedPrototypeTravelMm?: number;
  targetMountThroatDiameterMm?: number;
};
