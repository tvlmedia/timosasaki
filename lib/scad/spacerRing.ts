import type { SpacerRingParams } from "@/types";
import { n, scadHeader } from "@/lib/scad/utils";

export function generateSpacerRingScad(params: SpacerRingParams): string {
  return `${scadHeader(params.partName, params.facets)}inner_diameter = ${n(params.innerDiameterMm)};
outer_diameter = ${n(params.outerDiameterMm)};
thickness = ${n(params.thicknessMm)};
chamfer_enabled = ${params.chamferEnabled ? "true" : "false"};
chamfer_mm = ${n(params.chamferMm ?? 0)};

module spacer_air_gap_ring() {
  difference() {
    cylinder(h = thickness, d = outer_diameter);
    translate([0, 0, -0.1])
      cylinder(h = thickness + 0.2, d = inner_diameter);
  }
}

${params.hasAntiReflectionGrooves ? "// TODO: anti-reflection groove geometry\n" : ""}${params.chamferEnabled ? "// TODO: chamfer geometry\n" : ""}spacer_air_gap_ring();
`;
}
