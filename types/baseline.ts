import type { LensMountType } from "@/types/focusTravel";
import type {
  ElementOrientation,
  ElementOverallType,
  OpticalGroupType,
  OpticalPowerGuess,
  OpticalSubElement,
  SurfaceShape
} from "@/types/measurement";

export type OriginalLensBaseline = {
  id: string;
  name: string;
  donorLensName?: string;
  sourceMeasurementPhotoIds: string[];
  createdAt: string;
  updatedAt: string;

  housingLengthMm?: number;

  originalMount: LensMountType;
  originalFlangeDistanceMm: number;

  targetMount?: LensMountType;
  targetFlangeDistanceMm?: number;

  physicalComponents: BaselinePhysicalComponent[];
  airGaps: BaselineAirGap[];
  iris?: BaselineIris;
  flangeReference?: BaselineFlangeReference;

  notes?: string;
};

export type BaselinePhysicalComponent = {
  id: string;
  sourceAnnotationId?: string;

  label: string;
  componentMode: "single_element" | "optical_group";

  elementId?: string;
  role?: string;

  diameterMm?: number;
  thicknessMm?: number;
  clearApertureMm?: number;

  groupType?: OpticalGroupType;
  opticalSubElements?: OpticalSubElement[];

  elementOverallType?: ElementOverallType;
  frontSurfaceShape?: SurfaceShape;
  rearSurfaceShape?: SurfaceShape;
  opticalPowerGuess?: OpticalPowerGuess;

  hasSteppedProfile?: boolean;
  largeDiameterMm?: number;
  smallDiameterMm?: number;
  largeSectionThicknessMm?: number;
  smallSectionThicknessMm?: number;
  stepDirection?: "large_side_front" | "large_side_rear" | "unknown";

  coatingColor?: string;
  condition?: string;
  orientation?: ElementOrientation;
  notes?: string;
};

export type BaselineAirGap = {
  id: string;
  label: string;
  fromComponentId?: string;
  toComponentId?: string;
  thicknessMm: number;
  innerDiameterMm: number;
  outerDiameterMm: number;
  notes?: string;
};

export type BaselineIris = {
  id: string;
  label: string;
  positionMode: "between_components" | "absolute_z" | "unknown";
  beforeComponentId?: string;
  afterComponentId?: string;
  apertureDiameterMm?: number;
  diskDiameterMm?: number;
  thicknessMm?: number;
  contributesToStackLength: boolean;
  notes?: string;
};

export type BaselineFlangeReference = {
  referencePointLabel?: string;
  donorFlangeToReferenceInfinityMm?: number;
  donorFlangeToReferenceCloseFocusMm?: number;
  infinityOvertravelMm: number;
  closeFocusExtraMarginMm: number;
  notes?: string;
};
