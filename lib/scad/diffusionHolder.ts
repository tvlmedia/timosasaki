import type { DiffusionHolderParams } from "@/types";
import { n, scadHeader } from "@/lib/scad/utils";

export function generateDiffusionHolderScad(params: DiffusionHolderParams): string {
  const holderOuterDiameter = params.diskDiameterMm + params.wallThicknessMm * 2;
  const opticalOpening = Math.max(params.clearCenterDiameterMm, 0.5);
  const recessDiameter = params.diffusionOuterDiameterMm + params.wallThicknessMm * 0.5;
  const recessDepth = Math.max(params.holderThicknessMm - params.retainingLipMm, 0.4);

  return `${scadHeader(params.partName, params.facets)}disk_diameter = ${n(params.diskDiameterMm)};
clear_center_diameter = ${n(params.clearCenterDiameterMm)};
diffusion_outer_diameter = ${n(params.diffusionOuterDiameterMm)};
holder_thickness = ${n(params.holderThicknessMm)};
wall_thickness = ${n(params.wallThicknessMm)};
retaining_lip = ${n(params.retainingLipMm)};
holder_outer_diameter = ${n(holderOuterDiameter)};
optical_opening = ${n(opticalOpening)};

module diffusion_holder() {
  difference() {
    cylinder(h = holder_thickness, d = holder_outer_diameter);

    // Center optical opening
    translate([0, 0, -0.1])
      cylinder(h = holder_thickness + 0.2, d = optical_opening);

    // Diffusion seat recess
    translate([0, 0, retaining_lip])
      cylinder(h = ${n(recessDepth)}, d = ${n(recessDiameter)});
  }
}

// TODO: optional side slot/tab geometry
diffusion_holder();
`;
}
