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
  | "cemented_interface_side"
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

export type SteppedProfileSegment = {
  id: string;
  name?: string;
  diameterMm?: number;
  depthMm?: number;
};

export type AdvancedPhysicalProfileSection = {
  id: string;
  index: number;
  label?: string;
  diameterMm: number;
  lengthMm: number;
};

export type AdvancedPhysicalProfile = {
  enabled: boolean;
  totalLengthMm: number;
  maxDiameterMm: number;
  maxDiameterPositionFromFrontMm: number;
  sections: AdvancedPhysicalProfileSection[];
};

export type ThicknessMeasurementType =
  | "edge_thickness"
  | "center_max_thickness"
  | "straight_body_thickness"
  | "mechanical_block_length"
  | "estimated"
  | "unknown";

export type MeasurementConfidence = "measured" | "estimated" | "unknown";

export type AirspaceMeasurementType =
  | "optical_surface_to_optical_surface"
  | "mechanical_edge_or_seat_to_edge_or_seat"
  | "cad_face_to_cad_face"
  | "physical_caliper_estimate"
  | "estimated"
  | "unknown";

export type PhysicalSpacerThicknessSource =
  | "same_as_airspace"
  | "calculated_from_cup_offsets"
  | "manual_override";

export type AirspaceInsertedItem = {
  id: string;
  type: "iris" | "filter" | "diffusion" | "custom";
  label?: string;
  diskDiameterMm?: number;
  apertureDiameterMm?: number;
  thicknessMm: number;
  positionMode?:
    | "centered"
    | "distance_from_front"
    | "distance_from_rear"
    | "manual_split"
    | "distance_from_previous"
    | "distance_from_next"
    | "manual";
  distanceFromFrontMm?: number;
  distanceFromRearMm?: number;
  spacerBeforeMm?: number;
  spacerAfterMm?: number;
  // Legacy field kept for backward compatibility with older projects.
  positionMm?: number;
};

export type MeasurementItemType = "glass" | "spacer_ring" | "housing_barrel" | "iris_disk" | "other";

export type PhysicalComponentMode = "single_element" | "optical_group";

export type OpticalGroupType =
  | "cemented_doublet"
  | "cemented_triplet"
  | "air_spaced_group"
  | "fixed_rear_group"
  | "unknown_group";

export type OpticalSubElement = {
  id: string;
  elementId?: string;
  label: string;
  role?: string;
  elementOverallType?: ElementOverallType;
  frontSurfaceShape?: SurfaceShape;
  rearSurfaceShape?: SurfaceShape;
  opticalPowerGuess?: OpticalPowerGuess;
  notes?: string;
};

export type MeasurementFields = {
  elementId?: string;
  role?: string;
  physicalComponentMode?: PhysicalComponentMode;
  groupId?: string;
  groupType?: OpticalGroupType;
  groupOpticalPowerGuess?: OpticalPowerGuess;
  opticalSubElements?: OpticalSubElement[];

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
  thicknessMeasurementType?: ThicknessMeasurementType;
  thicknessConfidence?: MeasurementConfidence;

  hasSteppedProfile?: boolean;
  largeDiameterMm?: number;
  smallDiameterMm?: number;
  largeSectionThicknessMm?: number;
  smallSectionThicknessMm?: number;
  stepDirection?: StepDirection;
  steppedProfileSegments?: SteppedProfileSegment[];
  advancedProfile?: AdvancedPhysicalProfile;

  innerDiameterMm?: number;
  outerDiameterMm?: number;
  lengthMm?: number;
  desiredOpticalAirGapMm?: number;
  physicalSpacerThicknessMm?: number;
  physicalSpacerThicknessSource?: PhysicalSpacerThicknessSource;
  airspaceMeasurementType?: AirspaceMeasurementType;
  airspaceConfidence?: MeasurementConfidence;
  insertedItems?: AirspaceInsertedItem[];

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
