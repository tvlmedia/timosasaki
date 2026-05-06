import type { SlidingOpticalCarrierParams } from "@/types";

function n(value: number): string {
  return Number.isFinite(value) ? value.toFixed(4) : "0.0000";
}

function b(value: boolean): string {
  return value ? "True" : "False";
}

export function generateSlidingOpticalCarrierFreecadMacro(
  params: SlidingOpticalCarrierParams
): string {
  const pinHoleCount = Math.max(1, Math.floor(params.pinHoleCount));
  const pinBossDiameter = params.pinBossDiameterMm ?? params.pinHoleDiameterMm + 3;
  const pinBossHeight = params.pinBossHeightMm ?? 2;
  const startZ = params.startZMm ?? 0;

  return `# Timo Sasaki Lens Lab generated FreeCAD macro
# Part: ${params.partName}
# WARNING: Prototype geometry only. Check dimensions before printing or machining.

import FreeCAD as App
import Part


doc = App.newDocument("${params.partName}")

inner_diameter = ${n(params.innerDiameterMm)}
outer_diameter = ${n(params.outerDiameterMm)}
length = ${n(params.lengthMm)}
start_z = ${n(startZ)}
pin_hole_count = ${pinHoleCount}
pin_hole_angle_offset_deg = ${n(params.pinHoleAngleOffsetDeg)}
pin_hole_diameter = ${n(params.pinHoleDiameterMm)}
pin_hole_z = ${n(params.pinHoleZMm)}
add_pin_bosses = ${b(params.addPinBosses)}
pin_boss_diameter = ${n(pinBossDiameter)}
pin_boss_height = ${n(pinBossHeight)}

outer = Part.makeCylinder(outer_diameter / 2.0, length)
inner = Part.makeCylinder(inner_diameter / 2.0, length + 0.2)
inner.translate(App.Vector(0, 0, -0.1))
carrier = outer.cut(inner)

if add_pin_bosses:
    for i in range(pin_hole_count):
        angle = pin_hole_angle_offset_deg + (360.0 / pin_hole_count) * i
        boss = Part.makeCylinder(pin_boss_diameter / 2.0, pin_boss_height)
        boss.rotate(App.Vector(0, 0, 0), App.Vector(0, 1, 0), 90)
        boss.translate(App.Vector(outer_diameter / 2.0, 0, pin_hole_z))
        boss.rotate(App.Vector(0, 0, 0), App.Vector(0, 0, 1), angle)
        carrier = carrier.fuse(boss)

for i in range(pin_hole_count):
    angle = pin_hole_angle_offset_deg + (360.0 / pin_hole_count) * i
    hole = Part.makeCylinder(pin_hole_diameter / 2.0, outer_diameter * 2.0)
    hole.rotate(App.Vector(0, 0, 0), App.Vector(0, 1, 0), 90)
    hole.translate(App.Vector(0, 0, pin_hole_z))
    hole.rotate(App.Vector(0, 0, 0), App.Vector(0, 0, 1), angle)
    carrier = carrier.cut(hole)

obj = doc.addObject("Part::Feature", "Sliding_Optical_Carrier")
obj.Shape = carrier
obj.Placement.Base = App.Vector(0, 0, start_z)

doc.recompute()
`;
}
