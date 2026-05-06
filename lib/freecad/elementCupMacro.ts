import type { ElementCupParams } from "@/types";

function toFixed(value: number): string {
  return Number.isFinite(value) ? value.toFixed(4) : "0.0000";
}

function hasCompleteSteppedProfile(params: ElementCupParams): boolean {
  const stepped = params.steppedProfile;
  if (!stepped) return false;
  return (
    stepped.largeDiameterMm > 0 &&
    stepped.smallDiameterMm > 0 &&
    stepped.largeSectionThicknessMm > 0 &&
    stepped.smallSectionThicknessMm > 0
  );
}

export function generateElementCupFreecadMacro(params: ElementCupParams): string {
  if (hasCompleteSteppedProfile(params) && params.steppedProfile) {
    const stepped = params.steppedProfile;
    const largeSeatDiameter = stepped.largeDiameterMm + params.seatClearanceMm;
    const smallSeatDiameter = stepped.smallDiameterMm + params.seatClearanceMm;
    const totalGlassThickness = stepped.largeSectionThicknessMm + stepped.smallSectionThicknessMm;
    const cupDepth = params.cupDepthMm ?? totalGlassThickness + params.rearLipMm + 0.5;
    const outerDiameter =
      params.outerDiameterMm ?? Math.max(largeSeatDiameter, smallSeatDiameter) + params.wallThicknessMm * 2;
    const frontOpening = Math.max(
      Math.min(stepped.largeDiameterMm, stepped.smallDiameterMm) - Math.max(params.retainingLipMm * 2, 1),
      0.4
    );
    const largeSideFaces =
      stepped.stepDirection === "large_side_front"
        ? "front"
        : stepped.stepDirection === "large_side_rear"
          ? "rear"
          : "unknown";

    return `# Timo Sasaki Lens Lab generated FreeCAD macro
# Part: ${params.partName}
# WARNING: Prototype geometry only. Check dimensions before printing or machining.
# Z=0 is rear/support side. Z increases toward front/iris side.
# Stepped seat with large/small sections.

import FreeCAD as App
import Part

doc = App.newDocument("${params.partName}")

large_diameter = ${toFixed(stepped.largeDiameterMm)}
small_diameter = ${toFixed(stepped.smallDiameterMm)}
large_section_thickness = ${toFixed(stepped.largeSectionThicknessMm)}
small_section_thickness = ${toFixed(stepped.smallSectionThicknessMm)}
seat_clearance = ${toFixed(params.seatClearanceMm)}

large_seat_diameter = large_diameter + seat_clearance
small_seat_diameter = small_diameter + seat_clearance

rear_lip = ${toFixed(params.rearLipMm)}
wall_thickness = ${toFixed(params.wallThicknessMm)}
cup_depth = ${toFixed(cupDepth)}
outer_diameter = ${toFixed(outerDiameter)}
front_opening = ${toFixed(frontOpening)}
large_side_faces = "${largeSideFaces}"

outer = Part.makeCylinder(outer_diameter / 2, cup_depth)
front_opening_cut = Part.makeCylinder(front_opening / 2, cup_depth + 0.2)
front_opening_cut.translate(App.Vector(0, 0, -0.1))

if large_side_faces == "front":
    rear_cut = Part.makeCylinder(small_seat_diameter / 2, small_section_thickness + 0.05)
    rear_cut.translate(App.Vector(0, 0, rear_lip))

    front_cut = Part.makeCylinder(large_seat_diameter / 2, large_section_thickness + 0.8)
    front_cut.translate(App.Vector(0, 0, rear_lip + small_section_thickness))
else:
    rear_cut = Part.makeCylinder(large_seat_diameter / 2, large_section_thickness + 0.05)
    rear_cut.translate(App.Vector(0, 0, rear_lip))

    front_cut = Part.makeCylinder(small_seat_diameter / 2, small_section_thickness + 0.8)
    front_cut.translate(App.Vector(0, 0, rear_lip + large_section_thickness))

cup = outer.cut(rear_cut)
cup = cup.cut(front_cut)
cup = cup.cut(front_opening_cut)

obj = doc.addObject("Part::Feature", "Stepped_Element_Cup")
obj.Shape = cup

doc.recompute()
`;
  }

  const profileSegments = (params.profileSegments ?? []).filter(
    (segment) => segment.diameterMm > 0 && segment.depthMm > 0
  );
  const profileDepth =
    profileSegments.length > 0
      ? profileSegments.reduce((sum, segment) => sum + segment.depthMm, 0)
      : params.glassThicknessMm;

  const seatDiameter = params.glassDiameterMm + params.seatClearanceMm;
  const outerDiameter = params.outerDiameterMm ?? seatDiameter + params.wallThicknessMm * 2;
  const cupDepth = params.cupDepthMm ?? profileDepth + params.rearLipMm + 0.5;
  const frontOpening = Math.max(params.glassDiameterMm - params.retainingLipMm * 2, 0.4);

  const profileCuts = profileSegments.length
    ? profileSegments
        .reduce<{ script: string; z: number }>(
          (acc, segment, index) => {
            const cutName = `seat_cut_${index}`;
            const script = `${acc.script}
${cutName} = Part.makeCylinder((${toFixed(segment.diameterMm)} + seat_clearance) / 2, ${toFixed(segment.depthMm + 0.2)})
${cutName}.translate(App.Vector(0, 0, ${toFixed(acc.z)}))
cup = cup.cut(${cutName})
`;
            return { script, z: acc.z + segment.depthMm };
          },
          { script: "", z: params.rearLipMm }
        )
        .script
    : `
seat_cut = Part.makeCylinder(seat_diameter / 2, cup_depth + 0.2)
seat_cut.translate(App.Vector(0, 0, rear_lip))
cup = cup.cut(seat_cut)
`;

  return `# Timo Sasaki Lens Lab generated FreeCAD macro
# Part: ${params.partName}
# WARNING: Prototype geometry only. Check dimensions before printing or machining.

import FreeCAD as App
import Part

doc = App.newDocument("${params.partName}")

glass_diameter = ${toFixed(params.glassDiameterMm)}
glass_thickness = ${toFixed(params.glassThicknessMm)}
seat_clearance = ${toFixed(params.seatClearanceMm)}
seat_diameter = glass_diameter + seat_clearance
wall_thickness = ${toFixed(params.wallThicknessMm)}
outer_diameter = ${toFixed(outerDiameter)}
cup_depth = ${toFixed(cupDepth)}
rear_lip = ${toFixed(params.rearLipMm)}
front_opening = ${toFixed(frontOpening)}

outer = Part.makeCylinder(outer_diameter / 2, cup_depth)
cup = outer
${profileCuts}
front_opening_cut = Part.makeCylinder(front_opening / 2, cup_depth + 0.2)
front_opening_cut.translate(App.Vector(0, 0, -0.1))
cup = cup.cut(front_opening_cut)

obj = doc.addObject("Part::Feature", "Element_Cup")
obj.Shape = cup

doc.recompute()
`;
}
