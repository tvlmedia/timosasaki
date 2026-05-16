import type { GuidePinParams } from "@/types";
import { n, scadHeader } from "@/lib/scad/utils";

export function generateGuidePinScad(params: GuidePinParams): string {
  return `${scadHeader(params.partName, params.facets)}pin_shaft_diameter = ${n(params.pinShaftDiameterMm)};
pin_shaft_length = ${n(params.pinShaftLengthMm)};
pin_head_diameter = ${n(params.pinHeadDiameterMm)};
pin_head_thickness = ${n(params.pinHeadThicknessMm)};
tip_chamfer = ${n(params.tipChamferMm ?? 0)};
quantity = ${Math.max(1, Math.round(params.quantity))};
tip_chamfer_effective = min(max(0, tip_chamfer), max(0, pin_shaft_length - 0.01));
shaft_straight_length = max(0.01, pin_shaft_length - tip_chamfer_effective);

module guide_pin() {
  union() {
    // Shaft along X-axis: easy flat printing and no supports.
    rotate([0, 90, 0])
      cylinder(h = shaft_straight_length, d = pin_shaft_diameter);

    // Head sits on one end to stop the pin from falling through the slot.
    rotate([0, 90, 0])
      cylinder(h = pin_head_thickness, d = pin_head_diameter);

    // Optional tip chamfer to help insertion into carrier pin hole.
    if (tip_chamfer_effective > 0) {
      translate([shaft_straight_length, 0, 0])
        rotate([0, 90, 0])
          cylinder(h = tip_chamfer_effective, d1 = pin_shaft_diameter, d2 = 0.01);
    }
  }
}

for (i = [0 : quantity - 1]) {
  translate([0, i * (pin_head_diameter + 2.0), 0])
    guide_pin();
}
`;
}
