"use client";

import { useEffect, useMemo, useState } from "react";
import { CadPartSelector, type CadPartType } from "@/components/cad/CadPartSelector";
import { PartSpecCard } from "@/components/cad/PartSpecCard";
import { ScadCodeViewer } from "@/components/cad/ScadCodeViewer";
import { Select } from "@/components/common/Select";
import { WarningBox } from "@/components/common/WarningBox";
import { getPartWarnings, getRecommendedBarrelInnerDiameter, getRecommendedBarrelOuterDiameter } from "@/lib/calculations";
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

function createPayload(project: LensProject, partType: CadPartType, source?: StackItem): ScadPayload {
  const defaults = project.cadDefaults;
  const sourceName = source?.name ?? "part";
  const partName = `${partType}_${safeFileName(sourceName || "part")}`;

  switch (partType) {
    case "element_cup": {
      const glass = source?.type === "glass" ? source : undefined;
      return {
        type: "element_cup",
        params: {
          partName,
          glassDiameterMm: glass?.diameterMm ?? defaults.defaultInnerDiameterMm - 4,
          glassThicknessMm: glass?.thicknessMm ?? defaults.partThicknessMm,
          seatClearanceMm: defaults.printToleranceMm,
          wallThicknessMm: defaults.wallThicknessMm,
          retainingLipMm: defaults.retainingLipMm,
          rearLipMm: defaults.retainingLipMm,
          facets: defaults.facets
        }
      };
    }
    case "spacer_ring": {
      const spacer = source?.type === "spacer" ? source : undefined;
      return {
        type: "spacer_ring",
        params: {
          partName,
          innerDiameterMm: spacer?.innerDiameterMm ?? defaults.defaultInnerDiameterMm,
          outerDiameterMm: spacer?.outerDiameterMm ?? defaults.defaultOuterDiameterMm,
          thicknessMm: spacer?.thicknessMm ?? defaults.partThicknessMm,
          hasAntiReflectionGrooves: Boolean(spacer?.hasAntiReflectionGrooves),
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
      return {
        type: "main_barrel",
        params: {
          partName,
          innerDiameterMm: inner,
          outerDiameterMm: outer,
          lengthMm: barrel?.lengthMm ?? 80,
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
      const inner = barrel?.innerDiameterMm ?? getRecommendedBarrelInnerDiameter(project.stackItems, defaults) - 1;
      const outer = barrel?.outerDiameterMm ?? getRecommendedBarrelOuterDiameter(project.stackItems, defaults) - 0.5;
      return {
        type: "moving_carrier",
        params: {
          partName,
          innerDiameterMm: inner,
          outerDiameterMm: Math.max(outer, inner + defaults.wallThicknessMm),
          lengthMm: 28,
          camPinDiameterMm: defaults.camPinDiameterMm,
          antiRotationKeyEnabled: true,
          facets: defaults.facets
        }
      };
    }
    case "cam_sleeve": {
      const barrel = source?.type === "barrel" ? source : undefined;
      const inner = barrel?.outerDiameterMm ?? getRecommendedBarrelOuterDiameter(project.stackItems, defaults) + 0.5;
      return {
        type: "cam_sleeve",
        params: {
          partName,
          innerDiameterMm: inner,
          outerDiameterMm: inner + defaults.wallThicknessMm * 2,
          lengthMm: barrel?.lengthMm ?? 48,
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
  const code = generateScad(payload);
  const partWarnings = sourceItem ? getPartWarnings(sourceItem, project.cadDefaults) : [];

  const specs = useMemo<Record<string, string | number | boolean>>(() => {
    if (payload.type === "element_cup") {
      return {
        part_name: payload.params.partName,
        glass_diameter: `${pretty(payload.params.glassDiameterMm)} mm`,
        glass_thickness: `${pretty(payload.params.glassThicknessMm)} mm`,
        seat_clearance: `${pretty(payload.params.seatClearanceMm)} mm`,
        wall_thickness: `${pretty(payload.params.wallThicknessMm)} mm`
      };
    }
    if (payload.type === "spacer_ring") {
      return {
        part_name: payload.params.partName,
        inner_diameter: `${pretty(payload.params.innerDiameterMm)} mm`,
        outer_diameter: `${pretty(payload.params.outerDiameterMm)} mm`,
        thickness: `${pretty(payload.params.thicknessMm)} mm`,
        anti_reflection_grooves: payload.params.hasAntiReflectionGrooves
      };
    }
    if (payload.type === "iris_disk") {
      return {
        part_name: payload.params.partName,
        disk_diameter: `${pretty(payload.params.diskDiameterMm)} mm`,
        aperture_diameter: `${pretty(payload.params.apertureDiameterMm)} mm`,
        oval: payload.params.isOval,
        thickness: `${pretty(payload.params.thicknessMm)} mm`
      };
    }
    if (payload.type === "diffusion_holder") {
      return {
        part_name: payload.params.partName,
        disk_diameter: `${pretty(payload.params.diskDiameterMm)} mm`,
        clear_center: `${pretty(payload.params.clearCenterDiameterMm)} mm`,
        diffusion_outer: `${pretty(payload.params.diffusionOuterDiameterMm)} mm`,
        thickness: `${pretty(payload.params.holderThicknessMm)} mm`
      };
    }
    if (payload.type === "retaining_ring") {
      return {
        part_name: payload.params.partName,
        inner_diameter: `${pretty(payload.params.innerDiameterMm)} mm`,
        outer_diameter: `${pretty(payload.params.outerDiameterMm)} mm`,
        thickness: `${pretty(payload.params.thicknessMm)} mm`,
        notch_count: payload.params.notchCount
      };
    }
    if (payload.type === "main_barrel") {
      return {
        part_name: payload.params.partName,
        inner_diameter: `${pretty(payload.params.innerDiameterMm)} mm`,
        outer_diameter: `${pretty(payload.params.outerDiameterMm)} mm`,
        length: `${pretty(payload.params.lengthMm)} mm`,
        screw_hole_count: payload.params.screwHoleCount
      };
    }
    if (payload.type === "moving_carrier") {
      return {
        part_name: payload.params.partName,
        inner_diameter: `${pretty(payload.params.innerDiameterMm)} mm`,
        outer_diameter: `${pretty(payload.params.outerDiameterMm)} mm`,
        length: `${pretty(payload.params.lengthMm)} mm`,
        cam_pin_diameter: `${pretty(payload.params.camPinDiameterMm)} mm`
      };
    }
    return {
      part_name: payload.params.partName,
      inner_diameter: `${pretty(payload.params.innerDiameterMm)} mm`,
      outer_diameter: `${pretty(payload.params.outerDiameterMm)} mm`,
      length: `${pretty(payload.params.lengthMm)} mm`,
      rotation_degrees: payload.params.rotationDegrees,
      axial_travel: `${pretty(payload.params.axialTravelMm)} mm`
    };
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
    const filename = `sasaki_lens_lab_${safeFileName(project.name)}_${partLabel}.scad`;
    downloadTextFile(filename, code);
  };

  return (
    <div className="space-y-4">
      <div className="panel grid gap-4 p-4 md:grid-cols-2">
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
      </div>

      <PartSpecCard title="Part Specs" specs={specs} />
      <WarningBox title="Part Warnings" lines={partWarnings} />
      <WarningBox title="Safety Checks" lines={safetyWarnings} />
      <ScadCodeViewer code={code} onDownload={onDownload} />
    </div>
  );
}
