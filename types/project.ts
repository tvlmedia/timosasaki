import type { CadDefaults } from "@/types/cad";
import type { Experiment } from "@/types/experiment";
import type { MeasurementsState } from "@/types/measurement";
import type { StackItem } from "@/types/stack";

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
  targetMount?: "PL" | "LPL" | "EF" | "E" | "M42" | "CUSTOM";
  currentBuildVersion?: string;
  targetLook: TargetLook;
  notes: string;
  createdAt: string;
  updatedAt: string;
  stackItems: StackItem[];
  experiments: Experiment[];
  measurements: MeasurementsState;
  cadDefaults: CadDefaults;
};
