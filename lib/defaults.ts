import type { CadDefaults, LensProject, TargetLook } from "@/types";

export const defaultCadDefaults: CadDefaults = {
  printToleranceMm: 0.18,
  radialClearanceMm: 0.15,
  wallThicknessMm: 2,
  retainingLipMm: 0.8,
  partThicknessMm: 2,
  screwDiameterMm: 2,
  camPinDiameterMm: 2,
  camSlotClearanceMm: 0.3,
  defaultOuterDiameterMm: 50,
  defaultInnerDiameterMm: 40,
  facets: 128
};

export const defaultTargetLook: TargetLook = {
  swirl: 5,
  glow: 5,
  warmth: 5,
  contrast: 5,
  sharpness: 5,
  flareChaos: 5,
  stopDownCleanup: 5,
  caControl: 5,
  facesOnThirdsUsable: 5
};

export function createDemoProject(): LensProject {
  const now = new Date().toISOString();
  return {
    id: "demo-helios-omit-50",
    name: "Helios Omit 50 Prototype",
    donorLens: "Helios 44-2",
    baseFocalLengthMm: 58,
    targetFormat: "FULL_FRAME",
    targetImageCircleMm: 46.3,
    targetMount: "PL",
    currentBuildVersion: "V1",
    notes:
      "Experimental Timo Sasaki / Omit-style prototype. Goal: vintage wide open, cleaner when stopped down.",
    targetLook: {
      swirl: 8,
      glow: 8,
      warmth: 7,
      contrast: 4,
      sharpness: 5,
      flareChaos: 7,
      stopDownCleanup: 9,
      caControl: 7,
      facesOnThirdsUsable: 7
    },
    cadDefaults: { ...defaultCadDefaults },
    createdAt: now,
    updatedAt: now,
    stackItems: [
      {
        id: "e1",
        type: "glass",
        opticalType: "GLASS",
        name: "E1 front element",
        positionIndex: 0,
        diameterMm: 30.97,
        thicknessMm: 4.2,
        flipped: false,
        coatingColor: "amber/blue",
        glassUnknown: true,
        measuredConfidence: "medium"
      },
      {
        id: "spacer1",
        type: "spacer",
        opticalType: "SPACER",
        name: "Spacer / Air Gap Ring E1-E2",
        positionIndex: 1,
        innerDiameterMm: 28,
        outerDiameterMm: 38,
        thicknessMm: 5,
        hasAntiReflectionGrooves: false,
        chamferEnabled: false,
        chamferMm: 0.2
      },
      {
        id: "e2",
        type: "glass",
        opticalType: "GLASS",
        name: "E2 element",
        positionIndex: 2,
        diameterMm: 27.93,
        thicknessMm: 3.8,
        flipped: false,
        glassUnknown: true,
        measuredConfidence: "medium"
      },
      {
        id: "diff1",
        type: "diffusion",
        opticalType: "DIFFUSION",
        name: "Clear-center diffusion disk",
        positionIndex: 3,
        diskDiameterMm: 30,
        clearCenterDiameterMm: 12,
        diffusionOuterDiameterMm: 24,
        thicknessMm: 1,
        strengthLabel: "subtle",
        positionNotes:
          "Near iris. Wide open should include diffusion ring; stopped down should clean up."
      },
      {
        id: "iris1",
        type: "iris",
        opticalType: "IRIS",
        name: "Iris disk 14mm",
        positionIndex: 4,
        diskDiameterMm: 30,
        apertureDiameterMm: 14,
        thicknessMm: 1.2,
        isOval: false,
        tabEnabled: true,
        tabWidthMm: 6,
        tabLengthMm: 8
      },
      {
        id: "spacer2",
        type: "spacer",
        opticalType: "SPACER",
        name: "Spacer / Air Gap Ring iris-rear group",
        positionIndex: 5,
        innerDiameterMm: 24,
        outerDiameterMm: 38,
        thicknessMm: 12,
        hasAntiReflectionGrooves: false,
        chamferEnabled: false,
        chamferMm: 0.2
      },
      {
        id: "rear",
        type: "glass",
        opticalType: "GLASS",
        name: "Rear group E3/E4",
        positionIndex: 6,
        diameterMm: 26.43,
        thicknessMm: 15.8,
        flipped: false,
        glassUnknown: true,
        measuredConfidence: "medium"
      },
      {
        id: "mount",
        type: "mount",
        opticalType: "MOUNT",
        name: "PL mount placeholder",
        positionIndex: 7,
        mountType: "PL",
        flangeDistanceMm: 52,
        innerClearanceMm: 40
      }
    ],
    experiments: []
  };
}
