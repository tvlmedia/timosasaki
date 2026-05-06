import type { ElementCupParams } from "@/types";
import { n, scadHeader } from "@/lib/scad/utils";

export function generateElementCupScad(params: ElementCupParams): string {
  const seatDiameter = params.glassDiameterMm + params.seatClearanceMm;
  const outerDiameter = params.outerDiameterMm ?? seatDiameter + params.wallThicknessMm * 2;
  const cupDepth = params.cupDepthMm ?? params.glassThicknessMm + params.rearLipMm + 0.5;
  const frontOpening = Math.max(params.glassDiameterMm - params.retainingLipMm * 2, 0.4);

  return `${scadHeader(params.partName, params.facets)}glass_diameter = ${n(params.glassDiameterMm)};
glass_thickness = ${n(params.glassThicknessMm)};
seat_clearance = ${n(params.seatClearanceMm)};
seat_diameter = ${n(seatDiameter)};
wall_thickness = ${n(params.wallThicknessMm)};
outer_diameter = ${n(outerDiameter)};
cup_depth = ${n(cupDepth)};
rear_lip = ${n(params.rearLipMm)};
front_opening = ${n(frontOpening)};

module element_cup() {
  difference() {
    cylinder(h = cup_depth, d = outer_diameter);

    // Glass seat cavity
    translate([0, 0, rear_lip])
      cylinder(h = cup_depth + 0.2, d = seat_diameter);

    // Optical clear opening
    translate([0, 0, -0.1])
      cylinder(h = cup_depth + 0.2, d = front_opening);
  }
}

element_cup();
`;
}
