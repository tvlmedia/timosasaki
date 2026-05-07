import type { CadDefaults } from "@/types/cad";
import type { OriginalLensBaseline } from "@/types/baseline";
import type { Experiment } from "@/types/experiment";
import type { FocusTravelSetup, LensMountType } from "@/types/focusTravel";
import type { MeasurementsState } from "@/types/measurement";
import type { MechanicalPart, StackItem } from "@/types/stack";

export type TargetLook = {
  swirl: number;
  glow: number;
  warmth: number;
  contrast: number;
  sharpness: number;
  flareChaos: number;
  stopDownCleanup: number;
  caControl: number;
  facesOnThirdsUsable: number;
};

export type LensProject = {
  id: string;
  name: string;
  donorLens?: string;
  baseFocalLengthMm?: number;
  targetFormat?: "S16" | "S35" | "FULL_FRAME" | "65MM" | "CUSTOM";
  targetImageCircleMm?: number;
  targetMount?: LensMountType;
  currentBuildVersion?: string;
  targetLook: TargetLook;
  notes: string;
  createdAt: string;
  updatedAt: string;
  stackItems: StackItem[];
  mechanicalParts?: MechanicalPart[];
  experiments: Experiment[];
  measurements: MeasurementsState;
  focusTravel?: FocusTravelSetup;
  originalLensBaseline?: OriginalLensBaseline;
  cadDefaults: CadDefaults;
};
