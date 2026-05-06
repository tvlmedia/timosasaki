export type CalibrationReferenceType =
  | "housing_length"
  | "caliper"
  | "ruler"
  | "known_ring"
  | "printed_card"
  | "other";

export type CalibrationReferenceGeometry =
  | {
      referenceType: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }
  | {
      referenceType: "box";
      x: number;
      y: number;
      width: number;
      height: number;
    };

export type ElementOverallType =
  | "unknown"
  | "biconvex"
  | "biconcave"
  | "plano_convex"
  | "plano_concave"
  | "positive_meniscus"
  | "negative_meniscus"
  | "cemented_doublet"
  | "cemented_triplet"
  | "air_spaced_group"
  | "flat_filter_window"
  | "anamorphic_cylindrical"
  | "prism"
  | "mechanical_housing"
  | "spacer_ring"
  | "iris_disk";

export type SurfaceShape =
  | "unknown"
  | "convex"
  | "concave"
  | "flat"
  | "cylindrical_convex"
  | "cylindrical_concave"
  | "aspheric_or_complex";

export type OpticalPowerGuess = "unknown" | "positive" | "negative" | "neutral_flat";

export type ElementOrientation =
  | "original_orientation"
  | "flipped"
  | "front_side_marked"
  | "rear_side_marked"
  | "unknown";

export type StepDirection = "large_side_front" | "large_side_rear" | "unknown";

export type MeasurementItemType = "glass" | "spacer_ring" | "housing_barrel" | "iris_disk" | "other";

export type MeasurementFields = {
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

  diameterMm?: number;
  thicknessMm?: number;
  edgeThicknessMm?: number;
  clearApertureMm?: number;

  hasSteppedProfile?: boolean;
  largeDiameterMm?: number;
  smallDiameterMm?: number;
  largeSectionThicknessMm?: number;
  smallSectionThicknessMm?: number;
  stepDirection?: StepDirection;

  innerDiameterMm?: number;
  outerDiameterMm?: number;
  lengthMm?: number;

  apertureDiameterMm?: number;
  diskDiameterMm?: number;

  notes?: string;
};

export type MeasurementAnnotation = {
  id: string;
  label: string;
  itemType: MeasurementItemType;
  linkedStackItemId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fields: MeasurementFields;
  createdAt: string;
  updatedAt: string;
};

export type MeasurementCalibration = {
  id: string;
  referenceLabel: string;
  knownLengthMm: number;
  referenceType: CalibrationReferenceType;
  geometry: CalibrationReferenceGeometry;
  pixelsPerMm: number;
  createdAt: string;
};

export type MeasurementsState = {
  photoDataUrl?: string;
  photoName?: string;
  photoUpdatedAt?: string;
  calibration?: MeasurementCalibration;
  annotations: MeasurementAnnotation[];
  updatedAt: string;
};
