import type {
  ElementOverallType,
  ElementOrientation,
  OpticalGroupType,
  OpticalSubElement,
  PhysicalComponentMode,
  OpticalPowerGuess,
  StepDirection,
  SurfaceShape
} from "@/types/measurement";

export type StackItemType =
  | "glass"
  | "spacer"
  | "iris"
  | "diffusion"
  | "mount"
  | "barrel"
  | "retaining_ring"
  | "custom";

export type OpticalItemType =
  | "GLASS"
  | "AIR_GAP"
  | "IRIS"
  | "DIFFUSION"
  | "FILTER"
  | "EFFECT"
  | "SPACER"
  | "MOUNT"
  | "BARREL"
  | "RETAINING_RING"
  | "CUSTOM";

export type BaseStackItem = {
  id: string;
  name: string;
  type: StackItemType;
  opticalType?: OpticalItemType;
  positionIndex: number;
  locked?: boolean;
  notes?: string;
};

export type GlassProfileSegment = {
  id: string;
  name?: string;
  diameterMm: number;
  depthMm: number;
};

export type GlassItem = BaseStackItem & {
  type: "glass";
  diameterMm: number;
  thicknessMm: number;
  advancedProfileEnabled?: boolean;
  profileSegments?: GlassProfileSegment[];
  edgeThicknessMm?: number;
  clearApertureMm?: number;
  flipped: boolean;
  physicalComponentMode?: PhysicalComponentMode;
  groupId?: string;
  groupType?: OpticalGroupType;
  groupOpticalPowerGuess?: OpticalPowerGuess;
  opticalSubElements?: OpticalSubElement[];
  elementId?: string;
  role?: string;
  elementOverallType?: ElementOverallType;
  frontSurfaceShape?: SurfaceShape;
  rearSurfaceShape?: SurfaceShape;
  opticalPowerGuess?: OpticalPowerGuess;
  orientation?: ElementOrientation;
  frontSideDescription?: string;
  rearSideDescription?: string;
  coatingColor?: string;
  condition?: string;
  hasSteppedProfile?: boolean;
  largeDiameterMm?: number;
  smallDiameterMm?: number;
  largeSectionThicknessMm?: number;
  smallSectionThicknessMm?: number;
  stepDirection?: StepDirection;
  glassUnknown?: boolean;
  movesWithFocus?: boolean;
  decenterMm?: number;
  tiltDeg?: number;
  measuredConfidence?: "low" | "medium" | "high";
};

export type SpacerItem = BaseStackItem & {
  type: "spacer";
  innerDiameterMm: number;
  outerDiameterMm: number;
  thicknessMm: number;
  autoFitToBarrel?: boolean;
  hasAntiReflectionGrooves?: boolean;
  chamferEnabled?: boolean;
  chamferMm?: number;
};

export type IrisItem = BaseStackItem & {
  type: "iris";
  diskDiameterMm: number;
  apertureDiameterMm: number;
  thicknessMm: number;
  isOval: boolean;
  ovalWidthMm?: number;
  ovalHeightMm?: number;
  tabEnabled?: boolean;
  tabWidthMm?: number;
  tabLengthMm?: number;
};

export type DiffusionItem = BaseStackItem & {
  type: "diffusion";
  diskDiameterMm: number;
  clearCenterDiameterMm: number;
  diffusionOuterDiameterMm: number;
  thicknessMm: number;
  strengthLabel?: "subtle" | "medium" | "strong" | "experimental";
  positionNotes?: string;
};

export type MountItem = BaseStackItem & {
  type: "mount";
  mountType: "PL" | "LPL" | "EF" | "E" | "M42" | "CUSTOM";
  flangeDistanceMm?: number;
  innerClearanceMm?: number;
  notes?: string;
};

export type BarrelItem = BaseStackItem & {
  type: "barrel";
  innerDiameterMm: number;
  outerDiameterMm: number;
  lengthMm: number;
  hasIrisSlot?: boolean;
  hasDiffusionSlot?: boolean;
  screwHoleCount?: number;
};

export type RetainingRingItem = BaseStackItem & {
  type: "retaining_ring";
  innerDiameterMm: number;
  outerDiameterMm: number;
  thicknessMm: number;
  notchCount?: number;
};

export type CustomItem = BaseStackItem & {
  type: "custom";
  lengthMm?: number;
  diameterMm?: number;
  customLabel?: string;
};

export type StackItem =
  | GlassItem
  | SpacerItem
  | IrisItem
  | DiffusionItem
  | MountItem
  | BarrelItem
  | RetainingRingItem
  | CustomItem;
