"use client";

import { useEffect, useMemo, useState } from "react";
import { CadPartSelector, type CadPartType } from "@/components/cad/CadPartSelector";
import { PartSpecCard } from "@/components/cad/PartSpecCard";
import { ScadCodeViewer } from "@/components/cad/ScadCodeViewer";
import { Select } from "@/components/common/Select";
import { WarningBox } from "@/components/common/WarningBox";
import {
  getPartWarnings,
  getRecommendedBarrelInnerDiameter,
  getRecommendedBarrelOuterDiameter,
  getTotalStackLength
} from "@/lib/calculations";
import { generateFreecadMacro, type FreecadPayload } from "@/lib/freecad";
import { safeFileName } from "@/lib/ids";
import { generateScad, type ScadPayload } from "@/lib/scad";
import { downloadTextFile } from "@/lib/storage";
import type { LensProject, StackItem } from "@/types";

const needsSource: Record<CadPartType, StackItem["type"] | null> = {
  element_cup: "glass",
  spacer_ring: "spacer",
  iris_disk: "iris",
  diffusion_holder: "diffusion",
  retaining_ring: "retaining_ring",
  main_barrel: "barrel",
  moving_carrier: "barrel",
  cam_sleeve: "barrel"
};

function pretty(value: number): string {
  return value.toFixed(2);
}

function toMmToken(value: number): string {
  return value.toFixed(1).replace(".", "_");
}

function toPositive(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

function getNearestBarrelInnerDiameter(items: StackItem[], source?: StackItem): number | undefined {
  const barrels = items.filter(
    (item): item is Extract<StackItem, { type: "barrel" }> =>
      item.type === "barrel" && toPositive(item.innerDiameterMm) > 0
  );
  if (!barrels.length) return undefined;
  if (!source) return barrels[0].innerDiameterMm;

  const sourceIndex = source.positionIndex;
  const nearest = barrels.reduce((best, current) => {
    const bestDistance = Math.abs(best.positionIndex - sourceIndex);
    const currentDistance = Math.abs(current.positionIndex - sourceIndex);
    return currentDistance < bestDistance ? current : best;
  });
  return nearest.innerDiameterMm;
}

function estimateMainBarrelLengthMm(project: LensProject, source?: StackItem): number {
  const sourceBarrel = source?.type === "barrel" ? source : undefined;
  if (sourceBarrel && sourceBarrel.lengthMm > 0) {
    return sourceBarrel.lengthMm;
  }

  const stackLength = getTotalStackLength(project.stackItems);
  if (stackLength <= 0) return 48;

  const frontRearAllowance = Math.max(project.cadDefaults.partThicknessMm * 2, 8);
  const estimated = stackLength + frontRearAllowance;
  return Number(Math.max(36, Math.min(estimated, 120)).toFixed(1));
}

function createPayload(project: LensProject, partType: CadPartType, source?: StackItem): ScadPayload {
  const defaults = project.cadDefaults;
  const sourceName = source?.name ?? "part";
  const partName = `${partType}_${safeFileName(sourceName || "part")}`;

  switch (partType) {
    case "element_cup": {
      const glass = source?.type === "glass" ? source : undefined;
      const profileSegments = glass?.advancedProfileEnabled
        ? (glass.profileSegments ?? []).filter(
            (segment) => segment.diameterMm > 0 && segment.depthMm > 0
          )
        : [];
      const profileDepth =
        profileSegments.length > 0
          ? profileSegments.reduce((sum, segment) => sum + segment.depthMm, 0)
          : undefined;
      const glassDiameterMm = glass?.diameterMm ?? defaults.defaultInnerDiameterMm - 4;
      const seatClearanceMm = defaults.printToleranceMm;
      const seatDiameterMm = glassDiameterMm + seatClearanceMm;
      const minimumOuterFromSeat = seatDiameterMm + Math.max(defaults.wallThicknessMm * 2, 1.6);
      const nearestBarrelInner = getNearestBarrelInnerDiameter(project.stackItems, source);
      const recommendedBarrelInner = getRecommendedBarrelInnerDiameter(project.stackItems, defaults);
      const effectiveBarrelInner = Math.max(
        toPositive(nearestBarrelInner),
        toPositive(recommendedBarrelInner)
      );
      const fitClearancePerSide = Math.max(defaults.radialClearanceMm + defaults.printToleranceMm, 0.25);
      const barrelFitOuter =
        effectiveBarrelInner > 0
          ? effectiveBarrelInner - fitClearancePerSide * 2
          : undefined;
      const resolvedOuterDiameter = Math.max(
        minimumOuterFromSeat,
        barrelFitOuter ?? minimumOuterFromSeat
      );
      const resolvedWallThickness = Math.max(
        defaults.wallThicknessMm,
        (resolvedOuterDiameter - seatDiameterMm) / 2
      );

      return {
        type: "element_cup",
        params: {
          partName,
          glassDiameterMm,
          glassThicknessMm: profileDepth ?? glass?.thicknessMm ?? defaults.partThicknessMm,
          profileSegments: profileSegments.length ? profileSegments : undefined,
          seatClearanceMm,
          wallThicknessMm: Number(resolvedWallThickness.toFixed(3)),
          outerDiameterMm: Number(resolvedOuterDiameter.toFixed(3)),
          retainingLipMm: defaults.retainingLipMm,
          rearLipMm: defaults.retainingLipMm,
          facets: defaults.facets
        }
      };
    }
    case "spacer_ring": {
      const spacer = source?.type === "spacer" ? source : undefined;
      const spacerPartName = `spacer_air_gap_${safeFileName(sourceName || "ring")}`;
      return {
        type: "spacer_ring",
        params: {
          partName: spacerPartName,
          innerDiameterMm: spacer?.innerDiameterMm ?? defaults.defaultInnerDiameterMm,
          outerDiameterMm: spacer?.outerDiameterMm ?? defaults.defaultOuterDiameterMm,
          thicknessMm: spacer?.thicknessMm ?? defaults.partThicknessMm,
          hasAntiReflectionGrooves: Boolean(spacer?.hasAntiReflectionGrooves),
          chamferEnabled: Boolean(spacer?.chamferEnabled),
          chamferMm: spacer?.chamferMm ?? 0.2,
          facets: defaults.facets
        }
      };
    }
    case "iris_disk": {
      const iris = source?.type === "iris" ? source : undefined;
      return {
        type: "iris_disk",
        params: {
          partName,
          diskDiameterMm: iris?.diskDiameterMm ?? defaults.defaultOuterDiameterMm,
          apertureDiameterMm: iris?.apertureDiameterMm ?? defaults.defaultInnerDiameterMm * 0.4,
          thicknessMm: iris?.thicknessMm ?? 1.2,
          isOval: Boolean(iris?.isOval),
          ovalWidthMm: iris?.ovalWidthMm,
          ovalHeightMm: iris?.ovalHeightMm,
          tabEnabled: Boolean(iris?.tabEnabled),
          tabWidthMm: iris?.tabWidthMm,
          tabLengthMm: iris?.tabLengthMm,
          facets: defaults.facets
        }
      };
    }
    case "diffusion_holder": {
      const diff = source?.type === "diffusion" ? source : undefined;
      return {
        type: "diffusion_holder",
        params: {
          partName,
          diskDiameterMm: diff?.diskDiameterMm ?? defaults.defaultInnerDiameterMm,
          clearCenterDiameterMm: diff?.clearCenterDiameterMm ?? 12,
          diffusionOuterDiameterMm: diff?.diffusionOuterDiameterMm ?? 24,
          holderThicknessMm: diff?.thicknessMm ?? defaults.partThicknessMm,
          wallThicknessMm: defaults.wallThicknessMm,
          retainingLipMm: defaults.retainingLipMm,
          facets: defaults.facets
        }
      };
    }
    case "retaining_ring": {
      const ring = source?.type === "retaining_ring" ? source : undefined;
      return {
        type: "retaining_ring",
        params: {
          partName,
          innerDiameterMm: ring?.innerDiameterMm ?? defaults.defaultInnerDiameterMm,
          outerDiameterMm: ring?.outerDiameterMm ?? defaults.defaultOuterDiameterMm,
          thicknessMm: ring?.thicknessMm ?? defaults.partThicknessMm * 0.8,
          notchCount: ring?.notchCount ?? 2,
          notchWidthMm: 2,
          notchDepthMm: 1.5,
          facets: defaults.facets
        }
      };
    }
    case "main_barrel": {
      const barrel = source?.type === "barrel" ? source : undefined;
      const inner = barrel?.innerDiameterMm ?? getRecommendedBarrelInnerDiameter(project.stackItems, defaults);
      const outer = barrel?.outerDiameterMm ?? Math.max(inner + defaults.wallThicknessMm * 2, defaults.defaultOuterDiameterMm);
      const mainBarrelLength = estimateMainBarrelLengthMm(project, source);
      return {
        type: "main_barrel",
        params: {
          partName,
          innerDiameterMm: inner,
          outerDiameterMm: outer,
          lengthMm: mainBarrelLength,
          hasIrisSlot: Boolean(barrel?.hasIrisSlot),
          hasDiffusionSlot: Boolean(barrel?.hasDiffusionSlot),
          slotWidthMm: 4,
          slotLengthMm: 14,
          screwHoleCount: barrel?.screwHoleCount ?? 0,
          screwDiameterMm: defaults.screwDiameterMm,
          facets: defaults.facets
        }
      };
    }
    case "moving_carrier": {
      const barrel = source?.type === "barrel" ? source : undefined;
      const mainBarrelLength = estimateMainBarrelLengthMm(project, source);
      const inner = barrel?.innerDiameterMm ?? getRecommendedBarrelInnerDiameter(project.stackItems, defaults) - 1;
      const outer = barrel?.outerDiameterMm ?? getRecommendedBarrelOuterDiameter(project.stackItems, defaults) - 0.5;
      const carrierLength = Number(Math.max(18, Math.min(mainBarrelLength * 0.45, 42)).toFixed(1));
      return {
        type: "moving_carrier",
        params: {
          partName,
          innerDiameterMm: inner,
          outerDiameterMm: Math.max(outer, inner + defaults.wallThicknessMm),
          lengthMm: carrierLength,
          camPinDiameterMm: defaults.camPinDiameterMm,
          antiRotationKeyEnabled: true,
          facets: defaults.facets
        }
      };
    }
    case "cam_sleeve": {
      const barrel = source?.type === "barrel" ? source : undefined;
      const mainBarrelLength = estimateMainBarrelLengthMm(project, source);
      const inner = barrel?.outerDiameterMm ?? getRecommendedBarrelOuterDiameter(project.stackItems, defaults) + 0.5;
      const camSleeveLength = Number(Math.max(30, Math.min(mainBarrelLength * 0.8, 60)).toFixed(1));
      return {
        type: "cam_sleeve",
        params: {
          partName,
          innerDiameterMm: inner,
          outerDiameterMm: inner + defaults.wallThicknessMm * 2,
          lengthMm: barrel?.lengthMm ?? camSleeveLength,
          rotationDegrees: 90,
          axialTravelMm: 8,
          slotWidthMm: defaults.camPinDiameterMm + defaults.camSlotClearanceMm,
          facets: defaults.facets
        }
      };
    }
  }
}

export function CadGeneratorPanel({ project }: { project: LensProject }) {
  const [partType, setPartType] = useState<CadPartType>("element_cup");
  const [sourceItemId, setSourceItemId] = useState<string | undefined>();
  const [exportMode, setExportMode] = useState<"openscad" | "freecad_macro">("openscad");

  const sourceCandidates = useMemo(() => {
    const requiredType = needsSource[partType];
    if (!requiredType) return [];
    return project.stackItems.filter((item) => item.type === requiredType);
  }, [partType, project.stackItems]);

  useEffect(() => {
    if (!sourceCandidates.length) {
      setSourceItemId(undefined);
      return;
    }
    setSourceItemId((current) => (current && sourceCandidates.some((item) => item.id === current) ? current : sourceCandidates[0].id));
  }, [sourceCandidates]);

  const sourceItem = sourceCandidates.find((item) => item.id === sourceItemId);
  const payload = createPayload(project, partType, sourceItem);
  const freecadPayload: FreecadPayload | null =
    payload.type === "spacer_ring"
      ? {
          type: "spacer_ring",
          params: payload.params
        }
      : null;
  const code =
    exportMode === "freecad_macro"
      ? freecadPayload
        ? generateFreecadMacro(freecadPayload)
        : "# FreeCAD export is currently available for Spacer / Air Gap Ring only."
      : generateScad(payload);
  const exportModeWarnings =
    exportMode === "freecad_macro" && !freecadPayload
      ? ["FreeCAD macro export is currently available for Spacer / Air Gap Ring only."]
      : [];
  const partWarnings = sourceItem ? getPartWarnings(sourceItem, project.cadDefaults) : [];

  const specs = useMemo(() => {
    const values: Record<string, string | number | boolean> = {
      part_name: payload.params.partName
    };

    if (payload.type === "element_cup") {
      values.glass_diameter = `${pretty(payload.params.glassDiameterMm)} mm`;
      values.glass_thickness = `${pretty(payload.params.glassThicknessMm)} mm`;
      values.seat_clearance = `${pretty(payload.params.seatClearanceMm)} mm`;
      values.wall_thickness = `${pretty(payload.params.wallThicknessMm)} mm`;
      values.outer_diameter = `${pretty(payload.params.outerDiameterMm ?? 0)} mm`;
      values.profile_segments = payload.params.profileSegments?.length ?? 0;
      return values;
    }

    if (payload.type === "spacer_ring") {
      values.inner_diameter = `${pretty(payload.params.innerDiameterMm)} mm`;
      values.outer_diameter = `${pretty(payload.params.outerDiameterMm)} mm`;
      values.thickness = `${pretty(payload.params.thicknessMm)} mm`;
      values.anti_reflection_grooves = payload.params.hasAntiReflectionGrooves;
      values.chamfer_enabled = Boolean(payload.params.chamferEnabled);
      values.chamfer_mm = `${pretty(payload.params.chamferMm ?? 0)} mm`;
      return values;
    }

    if (payload.type === "iris_disk") {
      values.disk_diameter = `${pretty(payload.params.diskDiameterMm)} mm`;
      values.aperture_diameter = `${pretty(payload.params.apertureDiameterMm)} mm`;
      values.oval = payload.params.isOval;
      values.thickness = `${pretty(payload.params.thicknessMm)} mm`;
      return values;
    }

    if (payload.type === "diffusion_holder") {
      values.disk_diameter = `${pretty(payload.params.diskDiameterMm)} mm`;
      values.clear_center = `${pretty(payload.params.clearCenterDiameterMm)} mm`;
      values.diffusion_outer = `${pretty(payload.params.diffusionOuterDiameterMm)} mm`;
      values.thickness = `${pretty(payload.params.holderThicknessMm)} mm`;
      return values;
    }

    if (payload.type === "retaining_ring") {
      values.inner_diameter = `${pretty(payload.params.innerDiameterMm)} mm`;
      values.outer_diameter = `${pretty(payload.params.outerDiameterMm)} mm`;
      values.thickness = `${pretty(payload.params.thicknessMm)} mm`;
      values.notch_count = payload.params.notchCount;
      return values;
    }

    if (payload.type === "main_barrel") {
      values.inner_diameter = `${pretty(payload.params.innerDiameterMm)} mm`;
      values.outer_diameter = `${pretty(payload.params.outerDiameterMm)} mm`;
      values.length = `${pretty(payload.params.lengthMm)} mm`;
      values.screw_hole_count = payload.params.screwHoleCount;
      return values;
    }

    if (payload.type === "moving_carrier") {
      values.inner_diameter = `${pretty(payload.params.innerDiameterMm)} mm`;
      values.outer_diameter = `${pretty(payload.params.outerDiameterMm)} mm`;
      values.length = `${pretty(payload.params.lengthMm)} mm`;
      values.cam_pin_diameter = `${pretty(payload.params.camPinDiameterMm)} mm`;
      return values;
    }

    values.inner_diameter = `${pretty(payload.params.innerDiameterMm)} mm`;
    values.outer_diameter = `${pretty(payload.params.outerDiameterMm)} mm`;
    values.length = `${pretty(payload.params.lengthMm)} mm`;
    values.rotation_degrees = payload.params.rotationDegrees;
    values.axial_travel = `${pretty(payload.params.axialTravelMm)} mm`;
    return values;
  }, [payload]);

  const safetyWarnings = [
    "CAD output is a starting point for prototyping.",
    "Do not trust generated parts blindly.",
    "Check: glass cannot fall out.",
    "Check: retaining lips do not touch optical clear aperture.",
    "Check: mount/flange depth.",
    "Check: camera clearance.",
    "Check: material strength.",
    "Check: screw positions.",
    "Check: print tolerances.",
    "Check: heat/warping."
  ];

  if (project.targetMount === "PL") {
    safetyWarnings.push(
      "Do not use a 3D printed PL mount as a final load-bearing mount for valuable cameras/lenses."
    );
  }

  const onDownload = () => {
    const partLabel = safeFileName(payload.params.partName);
    const spacerThicknessToken =
      payload.type === "spacer_ring" ? `${toMmToken(payload.params.thicknessMm)}mm` : undefined;
    const filenameCore =
      payload.type === "spacer_ring" && spacerThicknessToken
        ? `sasaki_lens_lab_${partLabel}_${spacerThicknessToken}`
        : `sasaki_lens_lab_${safeFileName(project.name)}_${partLabel}`;
    const extension = exportMode === "freecad_macro" ? "FCMacro" : "scad";
    const filename = `${filenameCore}.${extension}`;
    downloadTextFile(filename, code);
  };

  return (
    <div className="space-y-4">
      <div className="panel grid gap-4 p-4 md:grid-cols-3">
        <CadPartSelector value={partType} onChange={setPartType} />
        <Select
          label="Source Item"
          value={sourceItemId ?? ""}
          onChange={(event) => setSourceItemId(event.target.value)}
          disabled={sourceCandidates.length === 0}
        >
          {sourceCandidates.length === 0 && <option value="">No matching stack item</option>}
          {sourceCandidates.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
        <Select
          label="CAD Export Mode"
          value={exportMode}
          onChange={(event) => setExportMode(event.target.value as "openscad" | "freecad_macro")}
        >
          <option value="openscad">OpenSCAD (.scad)</option>
          <option value="freecad_macro">FreeCAD Macro (.FCMacro)</option>
        </Select>
      </div>

      <PartSpecCard title="Part Specs" specs={specs} />
      <WarningBox title="Export Mode Notes" lines={exportModeWarnings} />
      <WarningBox title="Part Warnings" lines={partWarnings} />
      <WarningBox title="Safety Checks" lines={safetyWarnings} />
      <ScadCodeViewer
        code={code}
        onDownload={onDownload}
        codeTitle={exportMode === "freecad_macro" ? "FreeCAD Macro" : "OpenSCAD Code"}
        copyLabel={exportMode === "freecad_macro" ? "Copy FreeCAD Macro" : "Copy OpenSCAD"}
        downloadLabel={exportMode === "freecad_macro" ? "Download .FCMacro" : "Download .scad"}
      />
    </div>
  );
}
