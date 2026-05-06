import type { CamSleeveParams } from "@/types";
import { n, scadHeader } from "@/lib/scad/utils";

export function generateCamSleeveScad(params: CamSleeveParams): string {
  const camRadius = params.outerDiameterMm / 2 - Math.max(params.slotWidthMm * 0.6, 0.6);

  return `${scadHeader(params.partName, params.facets)}inner_diameter = ${n(params.innerDiameterMm)};
outer_diameter = ${n(params.outerDiameterMm)};
length = ${n(params.lengthMm)};
rotation_degrees = ${n(params.rotationDegrees)};
axial_travel = ${n(params.axialTravelMm)};
slot_width = ${n(params.slotWidthMm)};
cam_radius = ${n(camRadius)};
segments = 32;

module sleeve_body() {
  difference() {
    cylinder(h = length, d = outer_diameter);
    translate([0, 0, -0.1])
      cylinder(h = length + 0.2, d = inner_diameter);
  }
}

module cam_slot_path() {
  for (i = [0:segments - 1]) {
    a1 = i * (rotation_degrees / segments);
    a2 = (i + 1) * (rotation_degrees / segments);
    z1 = i * (axial_travel / segments);
    z2 = (i + 1) * (axial_travel / segments);

    hull() {
      rotate([0, 0, a1])
        translate([cam_radius, 0, z1])
          cube([slot_width, slot_width, slot_width], center = true);

      rotate([0, 0, a2])
        translate([cam_radius, 0, z2])
          cube([slot_width, slot_width, slot_width], center = true);
    }
  }
}

difference() {
  sleeve_body();
  cam_slot_path();
}

// Cam slot is approximate; inspect before printing.
`;
}
