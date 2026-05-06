import type { MovingCarrierParams } from "@/types";
import { n, scadHeader } from "@/lib/scad/utils";

export function generateMovingCarrierScad(params: MovingCarrierParams): string {
  return `${scadHeader(params.partName, params.facets)}inner_diameter = ${n(params.innerDiameterMm)};
outer_diameter = ${n(params.outerDiameterMm)};
length = ${n(params.lengthMm)};
cam_pin_diameter = ${n(params.camPinDiameterMm)};
anti_rotation_key_enabled = ${params.antiRotationKeyEnabled ? "true" : "false"};

module carrier_core() {
  difference() {
    cylinder(h = length, d = outer_diameter);
    translate([0, 0, -0.1])
      cylinder(h = length + 0.2, d = inner_diameter);
  }
}

module cam_pin_boss() {
  translate([outer_diameter / 2, 0, length * 0.5])
    rotate([0, 90, 0])
      cylinder(h = cam_pin_diameter * 2, d = cam_pin_diameter, center = true);
}

module anti_rotation_key() {
  translate([outer_diameter / 2 - 1.2, -1.2, 0])
    cube([2.4, 2.4, length]);
}

union() {
  carrier_core();
  cam_pin_boss();
  if (anti_rotation_key_enabled) {
    anti_rotation_key();
  }
}
`;
}
