import type { SlidingOpticalCarrierParams } from "@/types";
import { n, scadHeader } from "@/lib/scad/utils";

export function generateSlidingOpticalCarrierScad(params: SlidingOpticalCarrierParams): string {
  const pinHoleCount = Math.max(1, Math.floor(params.pinHoleCount));
  const pinBossDiameter = params.pinBossDiameterMm ?? params.pinHoleDiameterMm + 3;
  const pinBossHeight = params.pinBossHeightMm ?? 2;
  const startZ = params.startZMm ?? 0;
  const retainingLipEnabled = params.retainingLipEnabled ?? true;
  const retainingLipPosition =
    params.retainingLipPosition === "front" ||
    params.retainingLipPosition === "rear" ||
    params.retainingLipPosition === "both"
      ? params.retainingLipPosition
      : "rear";
  const retainingLipThickness = params.retainingLipThicknessMm ?? 1.2;
  const opticalClearAperture =
    typeof params.opticalClearApertureMm === "number" &&
    Number.isFinite(params.opticalClearApertureMm) &&
    params.opticalClearApertureMm > 0
      ? params.opticalClearApertureMm
      : undefined;
  const retainingLipInnerDiameterDefault = Math.max(
    30,
    opticalClearAperture !== undefined ? opticalClearAperture + 2.0 : 30
  );
  const retainingLipInnerDiameter =
    params.retainingLipInnerDiameterMm ?? retainingLipInnerDiameterDefault;

  return `${scadHeader(params.partName, params.facets)}
// Sliding optical carrier for axial-slot prototype focus.

inner_diameter = ${n(params.innerDiameterMm)};
outer_diameter = ${n(params.outerDiameterMm)};
length = ${n(params.lengthMm)};
start_z = ${n(startZ)};
carrier_inner_diameter = inner_diameter;
carrier_outer_diameter = outer_diameter;

retaining_lip_enabled = ${retainingLipEnabled ? "true" : "false"};
retaining_lip_position = "${retainingLipPosition}";
retaining_lip_thickness = ${n(retainingLipThickness)};
retaining_lip_inner_diameter = ${n(retainingLipInnerDiameter)};
optical_clear_aperture = ${n(opticalClearAperture ?? 0)};

pin_hole_count = ${pinHoleCount};
pin_hole_angle_offset_deg = ${n(params.pinHoleAngleOffsetDeg)};
pin_hole_diameter = ${n(params.pinHoleDiameterMm)};
pin_hole_z = ${n(params.pinHoleZMm)};

add_pin_bosses = ${params.addPinBosses ? "true" : "false"};
pin_boss_diameter = ${n(pinBossDiameter)};
pin_boss_height = ${n(pinBossHeight)};

if (retaining_lip_enabled && retaining_lip_thickness < 0.8)
  echo("Retaining lip may be too thin.");

if (retaining_lip_enabled && retaining_lip_inner_diameter >= carrier_inner_diameter)
  echo("Retaining lip inner diameter is too large; no retaining lip remains.");

if (retaining_lip_enabled && optical_clear_aperture > 0 && retaining_lip_inner_diameter <= optical_clear_aperture)
  echo("Retaining lip inner diameter should be larger than optical clear aperture.");

if (retaining_lip_enabled && retaining_lip_inner_diameter < (optical_clear_aperture > 0 ? optical_clear_aperture + 1.0 : 24.0))
  echo("Retaining lip may vignette the optical path.");

module carrier_outer_with_bosses() {
  union() {
    cylinder(h = length, d = carrier_outer_diameter);
    if (add_pin_bosses) {
      for (i = [0:pin_hole_count - 1]) {
        angle = pin_hole_angle_offset_deg + i * (360 / pin_hole_count);
        rotate([0, 0, angle])
          translate([carrier_outer_diameter / 2, 0, pin_hole_z])
            rotate([0, 90, 0])
              cylinder(h = pin_boss_height, d = pin_boss_diameter, center = true);
      }
    }
  }
}

module internal_bore_cuts() {
  if (!retaining_lip_enabled) {
    translate([0, 0, -0.1])
      cylinder(h = length + 0.2, d = carrier_inner_diameter);
  } else {
    // Clear optical hole through the whole part.
    translate([0, 0, -0.1])
      cylinder(h = length + 0.2, d = retaining_lip_inner_diameter);

    // Main bore expansion around the requested retaining lip position.
    if (retaining_lip_position == "rear") {
      translate([0, 0, retaining_lip_thickness])
        cylinder(h = max(0.01, length - retaining_lip_thickness + 0.2), d = carrier_inner_diameter);
    } else if (retaining_lip_position == "front") {
      translate([0, 0, -0.1])
        cylinder(h = max(0.01, length - retaining_lip_thickness + 0.2), d = carrier_inner_diameter);
    } else if (retaining_lip_position == "both") {
      translate([0, 0, retaining_lip_thickness])
        cylinder(h = max(0.01, length - retaining_lip_thickness * 2 + 0.2), d = carrier_inner_diameter);
    } else {
      translate([0, 0, retaining_lip_thickness])
        cylinder(h = max(0.01, length - retaining_lip_thickness + 0.2), d = carrier_inner_diameter);
    }
  }
}

module pin_hole_cuts() {
  for (i = [0:pin_hole_count - 1]) {
    angle = pin_hole_angle_offset_deg + i * (360 / pin_hole_count);
    rotate([0, 0, angle])
      translate([0, 0, pin_hole_z])
        rotate([0, 90, 0])
          cylinder(h = carrier_outer_diameter * 2, d = pin_hole_diameter, center = true);
  }
}

translate([0, 0, start_z])
  difference() {
    carrier_outer_with_bosses();
    internal_bore_cuts();
    pin_hole_cuts();
  }
`;
}
