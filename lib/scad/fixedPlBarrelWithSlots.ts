import type { FixedPLBarrelWithSlotsParams } from "@/types";
import { n } from "@/lib/scad/utils";

export function generateFixedPlBarrelWithSlotsPushPullV4Scad(params: FixedPLBarrelWithSlotsParams): string {
  const slotCount = Math.max(1, Math.floor(params.slotCount));
  const includePlMountInPart = params.includePlReferenceMount ?? true;
  const showGuidePins = false;
  const plReferenceStlPath =
    params.plReferenceStlPath || "/Users/tvlmedia/Downloads/Timo Sasaki/_repo/cad/reference/PL_Lens_Tail.stl";
  const barrelDirection = -1;
  const barrelAttachZ = params.barrelAttachZMm ?? 0.0;
  const plOverlap = Math.max(0, params.plReferenceOverlapMm ?? 2.0);

  const barrelInnerDiameter = Math.max(1, params.mainBarrelInnerDiameterMm || params.innerDiameterMm);
  const plClearanceOuterDiameter = Math.max(
    1,
    (params.plLockingClearanceDiameterMm && params.plLockingClearanceDiameterMm > 0
      ? params.plLockingClearanceDiameterMm
      : params.rearNeckOuterDiameterMm) || params.outerDiameterMm
  );
  const plClearanceLength = Math.max(0.1, params.plLockingClearanceLengthMm || params.rearNeckLengthMm || 4.0);
  const mainBarrelOuterDiameter = Math.max(
    plClearanceOuterDiameter,
    params.mainBarrelOuterDiameterMm || params.outerDiameterMm
  );
  const mainBarrelLength = Math.max(0.1, params.mainBarrelLengthMm || params.lengthMm);

  const reliefToMainOverlap = 1.2;
  const slotStartFromMainBarrel = Math.max(0, (params.slotStartZMm ?? 0) - plClearanceLength);
  const wallThickness = Math.max(0.1, (mainBarrelOuterDiameter - barrelInnerDiameter) / 2);
  const slotCutDepth = Math.max(8.0, wallThickness * 3);
  const slotWidth = Math.max(0.2, params.slotWidthMm || params.pinDiameterMm + params.pinClearanceMm);
  const pinDiameter = Math.max(0.1, params.pinDiameterMm);
  const pinClearance = Math.max(0, params.pinClearanceMm);

  return `// Timo Sasaki Lens Lab — PL Fixed Barrel Push/Pull V4
// Prototype geometry only.
//
// Doel:
// - PL mount + fixed barrel als één preview/printable assembly
// - Binnenboring blijft constant, zodat glas/carrier erdoor kan
// - Alleen buitenkant krijgt kort PL-lock clearance relief
// - Daarna main barrel met axiale slots
// - Geen losse inner ring / geen lange neck / geen extra flange

$fn = 160;

include_pl_mount_in_part = ${includePlMountInPart ? "true" : "false"};
show_guide_pins = ${showGuidePins ? "true" : "false"};

pl_reference_stl_path = "${plReferenceStlPath}";

pl_reference_offset_x = ${n(params.plReferenceOffsetXMm ?? 0)};
pl_reference_offset_y = ${n(params.plReferenceOffsetYMm ?? 0)};
pl_reference_offset_z = ${n(params.plReferenceOffsetZMm ?? 0)};

pl_reference_rotate_x_deg = ${n(params.plReferenceRotateXDeg ?? 0)};
pl_reference_rotate_y_deg = ${n(params.plReferenceRotateYDeg ?? 0)};
pl_reference_rotate_z_deg = ${n(params.plReferenceRotateZDeg ?? 0)};

pl_reference_flip_x = ${params.plReferenceFlipX ? "true" : "false"};
pl_reference_flip_y = ${params.plReferenceFlipY ? "true" : "false"};
pl_reference_flip_z = ${params.plReferenceFlipZ ? "true" : "false"};

barrel_direction = ${barrelDirection};
barrel_attach_z = ${n(barrelAttachZ)};
pl_overlap = ${n(plOverlap)};

barrel_inner_diameter = ${n(barrelInnerDiameter)};

pl_clearance_outer_diameter = ${n(plClearanceOuterDiameter)};
pl_clearance_length = ${n(plClearanceLength)};

main_barrel_outer_diameter = ${n(mainBarrelOuterDiameter)};
main_barrel_length = ${n(mainBarrelLength)};

relief_to_main_overlap = ${n(reliefToMainOverlap)};

slot_count = ${slotCount};
slot_angle_offset_deg = ${n(params.slotAngleOffsetDeg)};
slot_length = ${n(params.slotLengthMm)};
slot_width = ${n(slotWidth)};
slot_start_from_main_barrel = ${n(slotStartFromMainBarrel)};
slot_cut_depth = ${n(slotCutDepth)};
pin_diameter = ${n(pinDiameter)};
pin_clearance = ${n(pinClearance)};

guide_pin_diameter = pin_diameter;
guide_pin_length = main_barrel_outer_diameter + 10;

module tube_at(z, od, id, h) {
  translate([0, 0, z])
    difference() {
      cylinder(h = h, d = od);
      translate([0, 0, -0.1])
        cylinder(h = h + 0.2, d = id);
    }
}

module pl_mount_import() {
  translate([pl_reference_offset_x, pl_reference_offset_y, pl_reference_offset_z])
    rotate([pl_reference_rotate_x_deg, pl_reference_rotate_y_deg, pl_reference_rotate_z_deg])
      scale([
        pl_reference_flip_x ? -1 : 1,
        pl_reference_flip_y ? -1 : 1,
        pl_reference_flip_z ? -1 : 1
      ])
        import(pl_reference_stl_path);
}

module generated_barrel_local_positive_z() {
  difference() {
    union() {
      tube_at(
        -pl_overlap,
        pl_clearance_outer_diameter,
        barrel_inner_diameter,
        pl_clearance_length + pl_overlap
      );

      tube_at(
        pl_clearance_length - relief_to_main_overlap,
        main_barrel_outer_diameter,
        barrel_inner_diameter,
        main_barrel_length + relief_to_main_overlap
      );
    }

    for (i = [0:slot_count - 1]) {
      angle = slot_angle_offset_deg + i * 360 / slot_count;

      rotate([0, 0, angle])
        translate([
          main_barrel_outer_diameter / 2 - slot_cut_depth / 2,
          -slot_width / 2,
          pl_clearance_length + slot_start_from_main_barrel
        ])
          cube([
            slot_cut_depth,
            slot_width,
            slot_length
          ]);
    }
  }
}

module generated_barrel() {
  translate([0, 0, barrel_attach_z]) {
    if (barrel_direction == 1) {
      generated_barrel_local_positive_z();
    } else {
      scale([1, 1, -1])
        generated_barrel_local_positive_z();
    }
  }
}

module guide_pin_local(angle_deg) {
  rotate([0, 0, angle_deg])
    translate([
      0,
      0,
      pl_clearance_length + slot_start_from_main_barrel + slot_length / 2
    ])
      rotate([0, 90, 0])
        cylinder(
          h = guide_pin_length,
          d = guide_pin_diameter,
          center = true
        );
}

module guide_pins_visual() {
  if (show_guide_pins) {
    translate([0, 0, barrel_attach_z]) {
      if (barrel_direction == 1) {
        color([0.05, 0.25, 1.0, 1.0])
          for (i = [0:slot_count - 1]) {
            guide_pin_local(slot_angle_offset_deg + i * 360 / slot_count);
          }
      } else {
        scale([1, 1, -1])
          color([0.05, 0.25, 1.0, 1.0])
            for (i = [0:slot_count - 1]) {
              guide_pin_local(slot_angle_offset_deg + i * 360 / slot_count);
            }
      }
    }
  }
}

module complete_part() {
  union() {
    if (include_pl_mount_in_part) {
      pl_mount_import();
    }

    generated_barrel();
  }
}

color([1.0, 0.82, 0.0, 1.0])
  complete_part();

guide_pins_visual();

echo("barrel_direction = ", barrel_direction);
echo("barrel_attach_z = ", barrel_attach_z);
echo("barrel_inner_diameter constant = ", barrel_inner_diameter);
echo("pl_clearance_outer_diameter = ", pl_clearance_outer_diameter);
echo("pl_clearance_length = ", pl_clearance_length);
echo("main_barrel_outer_diameter = ", main_barrel_outer_diameter);
echo("main_barrel_length = ", main_barrel_length);
echo("slot_length = ", slot_length);
echo("slot_width = ", slot_width);
echo("slot clearance = ", slot_width - pin_diameter);
`;
}
