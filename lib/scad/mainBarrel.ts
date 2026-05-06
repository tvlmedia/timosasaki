import type { MainBarrelParams } from "@/types";
import { n, scadHeader } from "@/lib/scad/utils";

export function generateMainBarrelScad(params: MainBarrelParams): string {
  return `${scadHeader(params.partName, params.facets)}inner_diameter = ${n(params.innerDiameterMm)};
outer_diameter = ${n(params.outerDiameterMm)};
length = ${n(params.lengthMm)};
has_iris_slot = ${params.hasIrisSlot ? "true" : "false"};
has_diffusion_slot = ${params.hasDiffusionSlot ? "true" : "false"};
slot_width = ${n(params.slotWidthMm)};
slot_length = ${n(params.slotLengthMm)};
screw_hole_count = ${Math.max(0, Math.floor(params.screwHoleCount))};
screw_diameter = ${n(params.screwDiameterMm)};

module barrel_body() {
  difference() {
    cylinder(h = length, d = outer_diameter);
    translate([0, 0, -0.1])
      cylinder(h = length + 0.2, d = inner_diameter);
  }
}

module slot_cut(z_pos) {
  translate([outer_diameter / 2 - slot_width, -slot_width / 2, z_pos])
    cube([slot_width * 2, slot_width, slot_length]);
}

module radial_screw_holes() {
  for (i = [0:screw_hole_count - 1]) {
    angle = i * (360 / screw_hole_count);
    rotate([0, 0, angle])
      translate([0, 0, length / 2])
        rotate([0, 90, 0])
          cylinder(h = outer_diameter, d = screw_diameter, center = true);
  }
}

difference() {
  barrel_body();
  if (has_iris_slot) {
    slot_cut(length * 0.35);
  }
  if (has_diffusion_slot) {
    slot_cut(length * 0.55);
  }
  if (screw_hole_count > 0) {
    radial_screw_holes();
  }
}
`;
}
