import type { ElementCupParams } from "@/types";
import { n, scadHeader } from "@/lib/scad/utils";

function hasCompleteSteppedProfile(params: ElementCupParams): boolean {
  const stepped = params.steppedProfile;
  if (!stepped) return false;
  return (
    stepped.largeDiameterMm > 0 &&
    stepped.smallDiameterMm > 0 &&
    stepped.largeSectionThicknessMm > 0 &&
    stepped.smallSectionThicknessMm > 0 &&
    Boolean(stepped.stepDirection)
  );
}

export function generateElementCupScad(params: ElementCupParams): string {
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

    return `${scadHeader(params.partName, params.facets)}// Z=0 is rear/support side. Z increases toward front/iris side.
// This part has a stepped internal seat.

part_name = "${params.partName}";
large_diameter = ${n(stepped.largeDiameterMm)};
small_diameter = ${n(stepped.smallDiameterMm)};
large_section_thickness = ${n(stepped.largeSectionThicknessMm)};
small_section_thickness = ${n(stepped.smallSectionThicknessMm)};
seat_clearance = ${n(params.seatClearanceMm)};

large_seat_diameter = large_diameter + seat_clearance;
small_seat_diameter = small_diameter + seat_clearance;

total_glass_thickness = large_section_thickness + small_section_thickness;
rear_lip = ${n(params.rearLipMm)};
wall_thickness = ${n(params.wallThicknessMm)};
cup_depth = ${n(cupDepth)};
outer_diameter = ${n(outerDiameter)};
front_opening = ${n(frontOpening)};
large_side_faces = "${largeSideFaces}";
use_advanced_profile = true;

module stepped_element_cup() {
  difference() {
    cylinder(h = cup_depth, d = outer_diameter);

    if (large_side_faces == "front") {
      // Rear small-diameter seat section (large side faces front).
      translate([0, 0, rear_lip])
        cylinder(h = small_section_thickness + 0.05, d = small_seat_diameter);

      // Front large-diameter seat section.
      translate([0, 0, rear_lip + small_section_thickness])
        cylinder(h = large_section_thickness + 0.8, d = large_seat_diameter);
    } else {
      // Rear large-diameter seat section (default, and for large_side_rear).
      translate([0, 0, rear_lip])
        cylinder(h = large_section_thickness + 0.05, d = large_seat_diameter);

      // Front small-diameter seat section.
      translate([0, 0, rear_lip + large_section_thickness])
        cylinder(h = small_section_thickness + 0.8, d = small_seat_diameter);
    }

    // Optical clear opening through front.
    translate([0, 0, -0.1])
      cylinder(h = cup_depth + 0.2, d = front_opening);
  }
}

stepped_element_cup();
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
  const usesProfile = profileSegments.length > 0;
  const profileZStarts = usesProfile
    ? profileSegments.reduce<number[]>((acc, segment, index) => {
        if (index === 0) return [params.rearLipMm];
        const prevStart = acc[index - 1];
        const prevDepth = profileSegments[index - 1].depthMm;
        return [...acc, prevStart + prevDepth];
      }, [])
    : [];

  const profileArrays = usesProfile
    ? `
profile_diameters = [${profileSegments.map((segment) => n(segment.diameterMm)).join(", ")}];
profile_depths = [${profileSegments.map((segment) => n(segment.depthMm)).join(", ")}];
profile_z_starts = [${profileZStarts.map((value) => n(value)).join(", ")}];
`
    : "";

  const profileModule = usesProfile
    ? `
module stepped_glass_seat() {
  for (i = [0 : len(profile_diameters) - 1]) {
    segment_depth = profile_depths[i];
    segment_seat_diameter = profile_diameters[i] + seat_clearance;
    translate([0, 0, profile_z_starts[i]])
      cylinder(h = segment_depth + 0.2, d = segment_seat_diameter);
  }
}
`
    : "";

  const cavityCut = usesProfile
    ? `
    // Stepped profile cavity from FRONT to REAR segment depths
    stepped_glass_seat();
`
    : `
    // Glass seat cavity
    translate([0, 0, rear_lip])
      cylinder(h = cup_depth + 0.2, d = seat_diameter);
`;

  return `${scadHeader(params.partName, params.facets)}part_name = "${params.partName}";
glass_diameter = ${n(params.glassDiameterMm)};
glass_thickness = ${n(params.glassThicknessMm)};
profile_total_depth = ${n(profileDepth)};
seat_clearance = ${n(params.seatClearanceMm)};
seat_diameter = ${n(seatDiameter)};
wall_thickness = ${n(params.wallThicknessMm)};
outer_diameter = ${n(outerDiameter)};
cup_depth = ${n(cupDepth)};
rear_lip = ${n(params.rearLipMm)};
front_opening = ${n(frontOpening)};
use_advanced_profile = ${usesProfile ? "true" : "false"};
${profileArrays}

${profileModule}
module element_cup() {
  difference() {
    cylinder(h = cup_depth, d = outer_diameter);
${cavityCut}

    // Optical clear opening
    translate([0, 0, -0.1])
      cylinder(h = cup_depth + 0.2, d = front_opening);
  }
}

element_cup();
`;
}
