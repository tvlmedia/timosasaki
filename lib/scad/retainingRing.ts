import type { RetainingRingParams } from "@/types";
import { n, scadHeader } from "@/lib/scad/utils";

export function generateRetainingRingScad(params: RetainingRingParams): string {
  return `${scadHeader(params.partName, params.facets)}inner_diameter = ${n(params.innerDiameterMm)};
outer_diameter = ${n(params.outerDiameterMm)};
thickness = ${n(params.thicknessMm)};
notch_count = ${Math.max(0, Math.floor(params.notchCount))};
notch_width = ${n(params.notchWidthMm)};
notch_depth = ${n(params.notchDepthMm)};

module ring_notches() {
  for (i = [0:notch_count - 1]) {
    angle = i * (360 / notch_count);
    rotate([0, 0, angle])
      translate([outer_diameter / 2 - notch_depth / 2, -notch_width / 2, thickness / 2])
        cube([notch_depth, notch_width, thickness + 0.4], center = true);
  }
}

difference() {
  cylinder(h = thickness, d = outer_diameter);
  translate([0, 0, -0.1])
    cylinder(h = thickness + 0.2, d = inner_diameter);
  if (notch_count > 0) {
    ring_notches();
  }
}
`;
}
