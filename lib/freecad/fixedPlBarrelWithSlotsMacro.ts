import type { FixedPLBarrelWithSlotsParams } from "@/types";

function n(value: number): string {
  return Number.isFinite(value) ? value.toFixed(4) : "0.0000";
}

export function generateFixedPlBarrelWithSlotsFreecadMacro(
  params: FixedPLBarrelWithSlotsParams
): string {
  const slotCount = Math.max(1, Math.floor(params.slotCount));
  const slotCenterRadius =
    params.slotCenterRadiusMm ??
    params.mainBarrelOuterDiameterMm / 2 -
      Math.max((params.mainBarrelOuterDiameterMm - params.mainBarrelInnerDiameterMm) / 4, 0.5);

  return `# Timo Sasaki Lens Lab generated FreeCAD macro
# Part: ${params.partName}
# WARNING: Prototype geometry only. Check dimensions before printing or machining.

import FreeCAD as App
import Part


doc = App.newDocument("${params.partName}")

rear_neck_outer_diameter = ${n(params.rearNeckOuterDiameterMm)}
rear_neck_inner_diameter = ${n(params.rearNeckInnerDiameterMm)}
rear_neck_length = ${n(params.rearNeckLengthMm)}

main_barrel_outer_diameter = ${n(params.mainBarrelOuterDiameterMm)}
main_barrel_inner_diameter = ${n(params.mainBarrelInnerDiameterMm)}
main_barrel_length = ${n(params.mainBarrelLengthMm)}
step_up_start_from_pl_flange = ${n(params.stepUpStartFromPLFlangeMm)}
pl_locking_clearance_diameter = ${n(params.plLockingClearanceDiameterMm ?? 0)}

slot_count = ${slotCount}
slot_angle_offset_deg = ${n(params.slotAngleOffsetDeg)}
slot_length = ${n(params.slotLengthMm)}
slot_width = ${n(params.slotWidthMm)}
slot_start_z = ${n(params.slotStartZMm)}
slot_center_radius = ${n(slotCenterRadius)}

if pl_locking_clearance_diameter > 0 and rear_neck_outer_diameter >= pl_locking_clearance_diameter:
    App.Console.PrintWarning("Rear neck outer diameter may collide with PL lock/throat clearance.\\n")

neck_outer = Part.makeCylinder(rear_neck_outer_diameter / 2.0, rear_neck_length)
neck_inner = Part.makeCylinder(rear_neck_inner_diameter / 2.0, rear_neck_length + 0.2)
neck_inner.translate(App.Vector(0, 0, -0.1))
neck = neck_outer.cut(neck_inner)

main_outer = Part.makeCylinder(main_barrel_outer_diameter / 2.0, main_barrel_length)
main_outer.translate(App.Vector(0, 0, step_up_start_from_pl_flange))
main_inner = Part.makeCylinder(main_barrel_inner_diameter / 2.0, main_barrel_length + 0.2)
main_inner.translate(App.Vector(0, 0, step_up_start_from_pl_flange - 0.1))
main = main_outer.cut(main_inner)

barrel = neck.fuse(main)

wall_thickness = max((main_barrel_outer_diameter - main_barrel_inner_diameter) / 2.0, 0.4)
slot_depth = wall_thickness * 3.0

for i in range(slot_count):
    angle = slot_angle_offset_deg + (360.0 / slot_count) * i
    slot_box = Part.makeBox(slot_depth, slot_width, slot_length)
    slot_box.translate(App.Vector(slot_center_radius - wall_thickness, -slot_width / 2.0, slot_start_z))
    slot_box.rotate(App.Vector(0, 0, 0), App.Vector(0, 0, 1), angle)
    barrel = barrel.cut(slot_box)

obj = doc.addObject("Part::Feature", "Fixed_PL_Barrel_With_Axial_Slots")
obj.Shape = barrel

doc.recompute()
`;
}
