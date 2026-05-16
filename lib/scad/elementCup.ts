import type { ElementCupParams } from "@/types";
import { n, scadHeader } from "@/lib/scad/utils";

type AdvancedProfileSection = NonNullable<ElementCupParams["advancedProfile"]>["sections"][number];

type BoreSection = {
  zStartMm: number;
  lengthMm: number;
  measuredDiameterMm: number;
};

function toPositive(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

function formatScadString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

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

function getAdvancedSections(params: ElementCupParams): AdvancedProfileSection[] {
  const sections = params.advancedProfile?.sections ?? [];
  return sections
    .slice()
    .sort((a, b) => a.index - b.index)
    .filter((section) => toPositive(section.diameterMm) > 0 && toPositive(section.lengthMm) > 0);
}

function hasCompleteAdvancedProfile(params: ElementCupParams): boolean {
  if (!params.advancedProfile?.enabled) return false;
  if (toPositive(params.advancedProfile.maxDiameterMm) <= 0) return false;
  if (toPositive(params.advancedProfile.totalLengthMm) <= 0) return false;
  const sections = getAdvancedSections(params);
  if (!sections.length) return false;
  return sections.length === (params.advancedProfile.sections ?? []).length;
}

function buildInsertionSafeBoreSections(
  sections: AdvancedProfileSection[],
  maxDiameterMm: number
): { sections: BoreSection[]; maxSectionIndex: number; sectionSumMm: number } {
  let maxSectionIndex = 0;
  let smallestDelta = Number.POSITIVE_INFINITY;

  sections.forEach((section, index) => {
    const delta = Math.abs(section.diameterMm - maxDiameterMm);
    if (delta < smallestDelta) {
      smallestDelta = delta;
      maxSectionIndex = index;
    }
  });

  const merged: BoreSection[] = [];
  let z = 0;
  sections.forEach((section, index) => {
    const boreMeasuredDiameter = index <= maxSectionIndex ? maxDiameterMm : section.diameterMm;
    const boreLength = section.lengthMm;
    const previous = merged[merged.length - 1];

    if (previous && Math.abs(previous.measuredDiameterMm - boreMeasuredDiameter) < 0.0001) {
      previous.lengthMm += boreLength;
      z += boreLength;
      return;
    }

    merged.push({
      zStartMm: z,
      lengthMm: boreLength,
      measuredDiameterMm: boreMeasuredDiameter
    });
    z += boreLength;
  });

  return {
    sections: merged,
    maxSectionIndex,
    sectionSumMm: z
  };
}

function generateAdvancedProfileScad(params: ElementCupParams): string {
  const advanced = params.advancedProfile!;
  const sections = getAdvancedSections(params);
  const maxDiameterMm = toPositive(advanced.maxDiameterMm);
  const seatClearanceMm = params.seatClearanceMm;
  const wallThicknessMm = params.wallThicknessMm;
  const rearLipMm = params.rearLipMm;
  const sectionData = buildInsertionSafeBoreSections(sections, maxDiameterMm);
  const sectionSumMm = sectionData.sectionSumMm;
  const lengthDifferenceMm = advanced.totalLengthMm - sectionSumMm;
  const extraDepthMm = Math.max((params.cupDepthMm ?? sectionSumMm + rearLipMm + 0.5) - (sectionSumMm + rearLipMm), 0);
  const cupDepthMm = sectionSumMm + rearLipMm + extraDepthMm;
  const outerDiameterMm = params.outerDiameterMm ?? maxDiameterMm + seatClearanceMm + wallThicknessMm * 2;

  const lastMeasuredDiameter = sections[sections.length - 1]?.diameterMm ?? maxDiameterMm;
  const defaultRearClearHoleMm = Math.max(lastMeasuredDiameter - 2, 0.4);
  const requestedRearClearHoleMm = Math.max(advanced.rearClearHoleMm ?? defaultRearClearHoleMm, 0.4);
  const lastBoreDiameterMm =
    (sectionData.sections[sectionData.sections.length - 1]?.measuredDiameterMm ?? maxDiameterMm) + seatClearanceMm;
  const rearClearHoleMm = Math.max(0.4, Math.min(requestedRearClearHoleMm, lastBoreDiameterMm - 0.2));

  const sectionVars = sections
    .map(
      (section, index) => `s${index + 1}_label = "${formatScadString(section.label || `Section ${index + 1}`)}";
s${index + 1}_d = ${n(section.diameterMm)};
s${index + 1}_l = ${n(section.lengthMm)};`
    )
    .join("\n\n");

  const boreVars = sectionData.sections
    .map(
      (section, index) => `bore${index + 1}_measured_d = ${n(section.measuredDiameterMm)};
bore${index + 1}_d = bore${index + 1}_measured_d + seat_clearance;
bore${index + 1}_z = ${n(section.zStartMm)};
bore${index + 1}_l = ${n(section.lengthMm)};`
    )
    .join("\n\n");

  const boreCutCalls = sectionData.sections
    .map((_, index) => {
      const isLast = index === sectionData.sections.length - 1;
      return `    bore_cutter(bore${index + 1}_z, bore${index + 1}_l${isLast ? " + extra_depth" : ""}, bore${index + 1}_d);`;
    })
    .join("\n");

  const debugBores = sectionData.sections
    .map(
      (section, index) =>
        `echo("Bore ${index + 1}: z ", ${n(section.zStartMm)}, " to ", ${n(section.zStartMm + section.lengthMm)}, " d ", bore${index + 1}_d);`
    )
    .join("\n");

  return `${scadHeader(params.partName, params.facets)}// Timo Sasaki Lens Lab - insertion-safe stepped lens cup
// Z=0 = front / insertion side
// Positive Z = toward rear / sensor side
// Bore before and through max diameter section uses max diameter so the lens block can physically slide into the cup.

show_cutaway = false;

total_length = ${n(advanced.totalLengthMm)};
max_diameter = ${n(maxDiameterMm)};
max_diameter_starts_at = ${n(advanced.maxDiameterPositionFromFrontMm)};

${sectionVars}

seat_clearance = ${n(seatClearanceMm)};
wall_thickness = ${n(wallThicknessMm)};
rear_lip = ${n(rearLipMm)};
extra_depth = ${n(extraDepthMm)};
section_sum = ${n(sectionSumMm)};
length_difference = total_length - section_sum;
max_d = max_diameter;

outer_diameter = ${n(outerDiameterMm)};
cup_depth = section_sum + rear_lip + extra_depth;

${boreVars}

rear_clear_hole_requested = ${n(requestedRearClearHoleMm)};
last_bore_d = ${n(lastBoreDiameterMm)};
rear_clear_hole = ${n(rearClearHoleMm)};

eps = 0.05;

module cup_outer() {
  cylinder(h = cup_depth, d = outer_diameter);
}

module bore_cutter(z, h, d) {
  translate([0, 0, z - eps])
    cylinder(h = h + eps * 2, d = d);
}

module rear_clear_hole_cutter() {
  translate([0, 0, section_sum - eps])
    cylinder(h = rear_lip + extra_depth + eps * 4, d = rear_clear_hole);
}

module cutaway() {
  translate([0, -outer_diameter, -1])
    cube([outer_diameter, outer_diameter * 2, cup_depth + 2]);
}

module stepped_lens_cup() {
  difference() {
    cup_outer();

${boreCutCalls}

    rear_clear_hole_cutter();

    if (show_cutaway) {
      cutaway();
    }
  }
}

stepped_lens_cup();

echo("Section sum = ", section_sum);
echo("Total length = ", total_length);
echo("Length difference = ", length_difference);
echo("Max diameter = ", max_d);
echo("Outer diameter = ", outer_diameter);
echo("Cup depth = ", cup_depth);
echo("Advanced section count = ", ${sections.length});
echo("Max section index used = ", ${sectionData.maxSectionIndex + 1});
${debugBores}
`;
}

export function generateElementCupScad(params: ElementCupParams): string {
  if (hasCompleteAdvancedProfile(params)) {
    return generateAdvancedProfileScad(params);
  }

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
