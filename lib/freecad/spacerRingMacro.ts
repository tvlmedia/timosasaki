import type { SpacerRingParams } from "@/types";

export function generateSpacerRingFreecadMacro(params: SpacerRingParams): string {
  return `# Timo Sasaki Lens Lab generated FreeCAD macro
# Part: ${params.partName}
# WARNING: Prototype geometry only. Check dimensions before printing or machining.

import FreeCAD as App
import Part

doc = App.newDocument("${params.partName}")

inner_diameter = ${params.innerDiameterMm.toFixed(2)}
outer_diameter = ${params.outerDiameterMm.toFixed(2)}
thickness = ${params.thicknessMm.toFixed(2)}
desired_optical_air_gap = ${(params.desiredOpticalAirGapMm ?? params.thicknessMm).toFixed(2)}
printed_spacer_thickness = ${(params.physicalSpacerThicknessMm ?? params.thicknessMm).toFixed(2)}
spacer_thickness_source = "${params.spacerThicknessSource ?? params.physicalSpacerThicknessSource ?? "same_as_airspace"}"
chamfer_enabled = ${params.chamferEnabled ? "True" : "False"}
chamfer_mm = ${(params.chamferMm ?? 0).toFixed(2)}

outer = Part.makeCylinder(outer_diameter / 2, thickness)
inner = Part.makeCylinder(inner_diameter / 2, thickness + 0.2)
inner.translate(App.Vector(0, 0, -0.1))

ring = outer.cut(inner)

# TODO: chamfer geometry for FreeCAD macro when chamfer_enabled is True.
obj = doc.addObject("Part::Feature", "Spacer_Air_Gap_Ring")
obj.Shape = ring

doc.recompute()
`;
}
