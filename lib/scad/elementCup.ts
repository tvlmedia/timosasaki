import type { ElementCupParams } from "@/types";
import { n, scadHeader } from "@/lib/scad/utils";

export function generateElementCupScad(params: ElementCupParams): string {
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

  return `${scadHeader(params.partName, params.facets)}glass_diameter = ${n(params.glassDiameterMm)};
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
