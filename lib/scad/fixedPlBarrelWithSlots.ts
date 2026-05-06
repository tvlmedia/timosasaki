import type { FixedPLBarrelWithSlotsParams } from "@/types";
import { n, scadHeader } from "@/lib/scad/utils";

export function generateFixedPlBarrelWithSlotsScad(params: FixedPLBarrelWithSlotsParams): string {
  const slotCount = Math.max(1, Math.floor(params.slotCount));
  const wallThickness = Math.max(
    (params.mainBarrelOuterDiameterMm - params.mainBarrelInnerDiameterMm) / 2,
    0.4
  );
  const slotCenterRadius =
    params.slotCenterRadiusMm ??
    params.mainBarrelOuterDiameterMm / 2 - wallThickness / 2;
  const totalLength = Math.max(
    params.lengthMm,
    params.stepUpStartFromPLFlangeMm + params.mainBarrelLengthMm,
    params.rearNeckLengthMm
  );
  const includePlReferenceMount = params.includePlReferenceMount ?? true;
  const useImportedPlReferenceStl = params.useImportedPlReferenceStl ?? false;
  const plReferenceStlPath = params.plReferenceStlPath ?? "cad/reference/PL_Lens_Tail.stl";
  const plReferenceMountThickness = Math.max(
    params.plReferenceMountThicknessMm ?? params.plLockingClearanceLengthMm,
    2
  );
  const plReferenceMountOuterDiameter = Math.max(
    params.plReferenceMountOuterDiameterMm ??
      Math.max(
        (params.plLockingClearanceDiameterMm ?? 0) > 0 ? (params.plLockingClearanceDiameterMm ?? 0) + 6 : 0,
        params.rearNeckOuterDiameterMm + 8
      ),
    params.rearNeckOuterDiameterMm + 2
  );
  const plReferenceMountInnerDiameter = Math.max(
    params.plReferenceMountInnerDiameterMm ?? params.rearNeckInnerDiameterMm,
    1
  );

  return `${scadHeader(params.partName, params.facets)}
// Sliding prototype focus (axial slots, no cam/helicoid)
// Z=0 at PL flange plane, +Z toward front.
// OpenSCAD cannot directly import STEP. For real PL geometry in OpenSCAD:
// convert PL_Lens_Tail.STEP -> PL_Lens_Tail.stl and set use_imported_pl_reference_stl = true.

inner_diameter = ${n(params.innerDiameterMm)};
outer_diameter = ${n(params.outerDiameterMm)};
length = ${n(totalLength)};

rear_neck_outer_diameter = ${n(params.rearNeckOuterDiameterMm)};
rear_neck_inner_diameter = ${n(params.rearNeckInnerDiameterMm)};
rear_neck_length = ${n(params.rearNeckLengthMm)};

main_barrel_outer_diameter = ${n(params.mainBarrelOuterDiameterMm)};
main_barrel_inner_diameter = ${n(params.mainBarrelInnerDiameterMm)};
main_barrel_length = ${n(params.mainBarrelLengthMm)};
pl_locking_clearance_length = ${n(params.plLockingClearanceLengthMm)};
pl_locking_clearance_diameter = ${n(params.plLockingClearanceDiameterMm ?? 0)};
step_up_start_from_pl_flange = ${n(params.stepUpStartFromPLFlangeMm)};

slot_count = ${slotCount};
slot_angle_offset_deg = ${n(params.slotAngleOffsetDeg)};
slot_length = ${n(params.slotLengthMm)};
slot_width = ${n(params.slotWidthMm)};
slot_start_z = ${n(params.slotStartZMm)};
slot_center_radius = ${n(slotCenterRadius)};
wall_thickness = ${n(wallThickness)};

pin_diameter = ${n(params.pinDiameterMm)};
pin_clearance = ${n(params.pinClearanceMm)};

include_pl_reference_mount = ${includePlReferenceMount ? "true" : "false"};
use_imported_pl_reference_stl = ${useImportedPlReferenceStl ? "true" : "false"};
pl_reference_stl_path = "${plReferenceStlPath}";
pl_reference_mount_thickness = ${n(plReferenceMountThickness)};
pl_reference_mount_outer_diameter = ${n(plReferenceMountOuterDiameter)};
pl_reference_mount_inner_diameter = ${n(plReferenceMountInnerDiameter)};
pl_reference_mount_z = ${n(-plReferenceMountThickness)};

module neck_section() {
  difference() {
    cylinder(h = rear_neck_length, d = rear_neck_outer_diameter);
    translate([0, 0, -0.1])
      cylinder(h = rear_neck_length + 0.2, d = rear_neck_inner_diameter);
  }
}

module main_section() {
  difference() {
    translate([0, 0, step_up_start_from_pl_flange])
      cylinder(h = main_barrel_length, d = main_barrel_outer_diameter);
    translate([0, 0, step_up_start_from_pl_flange - 0.1])
      cylinder(h = main_barrel_length + 0.2, d = main_barrel_inner_diameter);
  }
}

module barrel_body() {
  union() {
    neck_section();
    main_section();
  }
}

module axial_slot(angle_deg) {
  rotate([0, 0, angle_deg])
    translate([slot_center_radius - wall_thickness, -slot_width / 2, slot_start_z])
      cube([wall_thickness * 3, slot_width, slot_length]);
}

module axial_guide_slots() {
  for (i = [0:slot_count - 1]) {
    angle = slot_angle_offset_deg + i * (360 / slot_count);
    axial_slot(angle);
  }
}

module fixed_barrel_with_slots() {
  difference() {
    barrel_body();
    axial_guide_slots();
  }
}

module pl_mount_reference_placeholder() {
  difference() {
    translate([0, 0, pl_reference_mount_z])
      cylinder(h = pl_reference_mount_thickness, d = pl_reference_mount_outer_diameter);
    translate([0, 0, pl_reference_mount_z - 0.1])
      cylinder(h = pl_reference_mount_thickness + 0.2, d = pl_reference_mount_inner_diameter);
  }
}

module pl_mount_reference() {
  if (use_imported_pl_reference_stl) {
    // STL path is editable in generated code.
    // Keep this import as a reference body; align/rotate in CAD as needed.
    translate([0, 0, pl_reference_mount_z])
      import(pl_reference_stl_path);
  } else {
    pl_mount_reference_placeholder();
  }
}

union() {
  fixed_barrel_with_slots();
  if (include_pl_reference_mount) {
    pl_mount_reference();
  }
}

// TODO (future): cam/helicoid focus system.
`;
}
