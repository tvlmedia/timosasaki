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
carrier_inner_diameter = inner_diameter
carrier_outer_diameter = outer_diameter
retaining_lip_enabled = ${b(retainingLipEnabled)}
retaining_lip_position = "${retainingLipPosition}"
retaining_lip_thickness = ${n(retainingLipThickness)}
retaining_lip_inner_diameter = ${n(retainingLipInnerDiameter)}
optical_clear_aperture = ${n(opticalClearAperture ?? 0)}
pin_hole_count = ${pinHoleCount}
pin_hole_angle_offset_deg = ${n(params.pinHoleAngleOffsetDeg)}
pin_hole_diameter = ${n(params.pinHoleDiameterMm)}
pin_hole_z = ${n(params.pinHoleZMm)}
add_pin_bosses = ${b(params.addPinBosses)}
pin_boss_diameter = ${n(pinBossDiameter)}
pin_boss_height = ${n(pinBossHeight)}

if retaining_lip_enabled and retaining_lip_thickness < 0.8:
    print("Retaining lip may be too thin.")

if retaining_lip_enabled and retaining_lip_inner_diameter >= carrier_inner_diameter:
    print("Retaining lip inner diameter is too large; no retaining lip remains.")

if retaining_lip_enabled and optical_clear_aperture > 0 and retaining_lip_inner_diameter <= optical_clear_aperture:
    print("Retaining lip inner diameter should be larger than optical clear aperture.")

if retaining_lip_enabled and retaining_lip_inner_diameter < (optical_clear_aperture + 1.0 if optical_clear_aperture > 0 else 24.0):
    print("Retaining lip may vignette the optical path.")

outer = Part.makeCylinder(carrier_outer_diameter / 2.0, length)
carrier = outer

if retaining_lip_enabled:
    clear_hole = Part.makeCylinder(retaining_lip_inner_diameter / 2.0, length + 0.2)
    clear_hole.translate(App.Vector(0, 0, -0.1))
    carrier = carrier.cut(clear_hole)

    if retaining_lip_position == "rear":
        main_bore_h = max(0.01, length - retaining_lip_thickness + 0.2)
        main_bore = Part.makeCylinder(carrier_inner_diameter / 2.0, main_bore_h)
        main_bore.translate(App.Vector(0, 0, retaining_lip_thickness))
        carrier = carrier.cut(main_bore)
    elif retaining_lip_position == "front":
        main_bore_h = max(0.01, length - retaining_lip_thickness + 0.2)
        main_bore = Part.makeCylinder(carrier_inner_diameter / 2.0, main_bore_h)
        main_bore.translate(App.Vector(0, 0, -0.1))
        carrier = carrier.cut(main_bore)
    elif retaining_lip_position == "both":
        main_bore_h = max(0.01, length - (retaining_lip_thickness * 2.0) + 0.2)
        main_bore = Part.makeCylinder(carrier_inner_diameter / 2.0, main_bore_h)
        main_bore.translate(App.Vector(0, 0, retaining_lip_thickness))
        carrier = carrier.cut(main_bore)
    else:
        main_bore_h = max(0.01, length - retaining_lip_thickness + 0.2)
        main_bore = Part.makeCylinder(carrier_inner_diameter / 2.0, main_bore_h)
        main_bore.translate(App.Vector(0, 0, retaining_lip_thickness))
        carrier = carrier.cut(main_bore)
else:
    inner = Part.makeCylinder(carrier_inner_diameter / 2.0, length + 0.2)
    inner.translate(App.Vector(0, 0, -0.1))
    carrier = carrier.cut(inner)

if add_pin_bosses:
    for i in range(pin_hole_count):
        angle = pin_hole_angle_offset_deg + (360.0 / pin_hole_count) * i
        boss = Part.makeCylinder(pin_boss_diameter / 2.0, pin_boss_height)
        boss.rotate(App.Vector(0, 0, 0), App.Vector(0, 1, 0), 90)
        boss.translate(App.Vector(carrier_outer_diameter / 2.0, 0, pin_hole_z))
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
