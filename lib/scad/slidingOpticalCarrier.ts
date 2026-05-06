import type { SlidingOpticalCarrierParams } from "@/types";
import { n, scadHeader } from "@/lib/scad/utils";

export function generateSlidingOpticalCarrierScad(params: SlidingOpticalCarrierParams): string {
  const pinHoleCount = Math.max(1, Math.floor(params.pinHoleCount));
  const pinBossDiameter = params.pinBossDiameterMm ?? params.pinHoleDiameterMm + 3;
  const pinBossHeight = params.pinBossHeightMm ?? 2;
  const startZ = params.startZMm ?? 0;

  return `${scadHeader(params.partName, params.facets)}
// Sliding optical carrier for axial-slot prototype focus.

inner_diameter = ${n(params.innerDiameterMm)};
outer_diameter = ${n(params.outerDiameterMm)};
length = ${n(params.lengthMm)};
start_z = ${n(startZ)};

pin_hole_count = ${pinHoleCount};
pin_hole_angle_offset_deg = ${n(params.pinHoleAngleOffsetDeg)};
pin_hole_diameter = ${n(params.pinHoleDiameterMm)};
pin_hole_z = ${n(params.pinHoleZMm)};

add_pin_bosses = ${params.addPinBosses ? "true" : "false"};
pin_boss_diameter = ${n(pinBossDiameter)};
pin_boss_height = ${n(pinBossHeight)};

module carrier_outer_with_bosses() {
  union() {
    cylinder(h = length, d = outer_diameter);
    if (add_pin_bosses) {
      for (i = [0:pin_hole_count - 1]) {
        angle = pin_hole_angle_offset_deg + i * (360 / pin_hole_count);
        rotate([0, 0, angle])
          translate([outer_diameter / 2, 0, pin_hole_z])
            rotate([0, 90, 0])
              cylinder(h = pin_boss_height, d = pin_boss_diameter, center = true);
      }
    }
  }
}

module pin_hole_cuts() {
  for (i = [0:pin_hole_count - 1]) {
    angle = pin_hole_angle_offset_deg + i * (360 / pin_hole_count);
    rotate([0, 0, angle])
      translate([0, 0, pin_hole_z])
        rotate([0, 90, 0])
          cylinder(h = outer_diameter * 2, d = pin_hole_diameter, center = true);
  }
}

translate([0, 0, start_z])
  difference() {
    carrier_outer_with_bosses();
    translate([0, 0, -0.1])
      cylinder(h = length + 0.2, d = inner_diameter);
    pin_hole_cuts();
  }
`;
}
