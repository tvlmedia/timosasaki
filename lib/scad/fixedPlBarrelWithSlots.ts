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
  const useImportedPlReferenceStl = params.useImportedPlReferenceStl ?? true;
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
  const plReferenceImportedHeight = Math.max(
    params.plReferenceImportedHeightMm ?? plReferenceMountThickness,
    1
  );
  const plReferenceFlipX = params.plReferenceFlipX ?? false;
  const plReferenceFlipY = params.plReferenceFlipY ?? false;
  const plReferenceFlipZ = params.plReferenceFlipZ ?? false;
  const plReferenceRotateXDeg = params.plReferenceRotateXDeg ?? 0;
  const plReferenceRotateYDeg = params.plReferenceRotateYDeg ?? 0;
  const plReferenceRotateZDeg = params.plReferenceRotateZDeg ?? 0;
  const plReferenceOffsetXMm = params.plReferenceOffsetXMm ?? 0;
  const plReferenceOffsetYMm = params.plReferenceOffsetYMm ?? 0;
  const plReferenceOffsetZMm = params.plReferenceOffsetZMm ?? 0;
  const plReferenceOverlap = Math.min(1, Math.max(params.plReferenceOverlapMm ?? 0.6, 0.5));
  const fuseBarrelToPlReference = params.fuseBarrelToPlReference ?? true;
  const plReferenceMountZ = plReferenceFlipZ
    ? plReferenceOverlap
    : -plReferenceImportedHeight + plReferenceOverlap;
  const transitionCollarInnerDiameter = Math.max(
    1,
    Math.min(params.rearNeckInnerDiameterMm, plReferenceMountInnerDiameter)
  );
  const transitionCollarOuterDiameter = Math.max(
    transitionCollarInnerDiameter + 1.2,
    params.rearNeckOuterDiameterMm + 4,
    Math.min(params.mainBarrelOuterDiameterMm, plReferenceMountOuterDiameter - 2)
  );
  const transitionCollarHeight = Math.max(
    3,
    plReferenceOverlap * 2 + 2,
    params.plLockingClearanceLengthMm * 0.35
  );
  const transitionCollarZ = -transitionCollarHeight + plReferenceOverlap;

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
pl_reference_mount_z = ${n(plReferenceMountZ)};
pl_reference_imported_height = ${n(plReferenceImportedHeight)};
pl_reference_overlap = ${n(plReferenceOverlap)};
transition_collar_outer_diameter = ${n(transitionCollarOuterDiameter)};
transition_collar_inner_diameter = ${n(transitionCollarInnerDiameter)};
transition_collar_height = ${n(transitionCollarHeight)};
transition_collar_z = ${n(transitionCollarZ)};
pl_reference_flip_x = ${plReferenceFlipX ? "true" : "false"};
pl_reference_flip_y = ${plReferenceFlipY ? "true" : "false"};
pl_reference_flip_z = ${plReferenceFlipZ ? "true" : "false"};
pl_reference_rotate_x_deg = ${n(plReferenceRotateXDeg)};
pl_reference_rotate_y_deg = ${n(plReferenceRotateYDeg)};
pl_reference_rotate_z_deg = ${n(plReferenceRotateZDeg)};
pl_reference_offset_x = ${n(plReferenceOffsetXMm)};
pl_reference_offset_y = ${n(plReferenceOffsetYMm)};
pl_reference_offset_z = ${n(plReferenceOffsetZMm)};
fuse_barrel_to_pl_reference = ${fuseBarrelToPlReference ? "true" : "false"};

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

module pl_reference_import_transform() {
  translate([pl_reference_offset_x, pl_reference_offset_y, pl_reference_offset_z])
    rotate([pl_reference_rotate_x_deg, pl_reference_rotate_y_deg, pl_reference_rotate_z_deg])
      scale([
        pl_reference_flip_x ? -1 : 1,
        pl_reference_flip_y ? -1 : 1,
        pl_reference_flip_z ? -1 : 1
      ])
        import(pl_reference_stl_path);
}

module pl_mount_reference() {
  if (use_imported_pl_reference_stl) {
    // STL path is editable in generated code.
    // Imported STL is positioned so it overlaps barrel neck slightly,
    // which helps produce one connected printable body.
    translate([0, 0, pl_reference_mount_z])
      pl_reference_import_transform();
  } else {
    pl_mount_reference_placeholder();
  }
}

module transition_collar() {
  // Solid transition ring that overlaps both barrel and PL reference geometry.
  // This avoids coplanar-touch gaps and improves manifold fusion for printing.
  difference() {
    translate([0, 0, transition_collar_z])
      cylinder(h = transition_collar_height, d = transition_collar_outer_diameter);
    translate([0, 0, transition_collar_z - 0.1])
      cylinder(h = transition_collar_height + 0.2, d = transition_collar_inner_diameter);
  }
}

if (fuse_barrel_to_pl_reference) {
  union() {
    fixed_barrel_with_slots();
    if (include_pl_reference_mount) {
      transition_collar();
      pl_mount_reference();
    }
  }
} else {
  fixed_barrel_with_slots();
  if (include_pl_reference_mount) {
    transition_collar();
    pl_mount_reference();
  }
}

// TODO (future): cam/helicoid focus system.
`;
}
