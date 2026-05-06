import type { SlidingFocusAssemblyMacroParams } from "@/types";

function n(value: number): string {
  return Number.isFinite(value) ? value.toFixed(4) : "0.0000";
}

function b(value: boolean): string {
  return value ? "True" : "False";
}

export function generateSlidingFocusAssemblyFreecadMacro(
  params: SlidingFocusAssemblyMacroParams
): string {
  const safePartName = params.partName.replace(/"/g, "_");
  const slotCount = Math.max(1, Math.floor(params.fixedBarrel.slotCount));
  const pinHoleCount = Math.max(1, Math.floor(params.slidingCarrier.pinHoleCount));
  const slotCenterRadius =
    params.fixedBarrel.slotCenterRadiusMm ??
    params.fixedBarrel.mainBarrelOuterDiameterMm / 2 -
      Math.max(
        (params.fixedBarrel.mainBarrelOuterDiameterMm - params.fixedBarrel.mainBarrelInnerDiameterMm) / 4,
        0.5
      );
  const pinBossDiameter =
    params.slidingCarrier.pinBossDiameterMm ?? params.slidingCarrier.pinHoleDiameterMm + 3;
  const pinBossHeight = params.slidingCarrier.pinBossHeightMm ?? 2;
  const carrierStartZ = params.slidingCarrier.startZMm ?? 0;

  const focusPrototypeStartLiteral =
    typeof params.focusPrototypeStartMm === "number" && Number.isFinite(params.focusPrototypeStartMm)
      ? n(params.focusPrototypeStartMm)
      : "None";
  const recommendedTravelLiteral =
    typeof params.recommendedPrototypeTravelMm === "number" &&
    Number.isFinite(params.recommendedPrototypeTravelMm)
      ? n(params.recommendedPrototypeTravelMm)
      : "None";
  const targetMountThroatLiteral =
    typeof params.targetMountThroatDiameterMm === "number" &&
    Number.isFinite(params.targetMountThroatDiameterMm)
      ? n(params.targetMountThroatDiameterMm)
      : "None";

  return `# Timo Sasaki Lens Lab generated FreeCAD assembly macro
# Part: ${safePartName}
# WARNING: Prototype geometry only. Check tolerances and dimensions before printing/machining.
# Sliding prototype focus: straight axial slots (no cam/helicoid in V1).
# Coordinate assumption:
#   Z-axis = optical axis
#   Z=0 = target PL flange plane
#   +Z = toward front of lens
#   -Z = toward sensor/camera

import FreeCAD as App
import Part
import ImportGui
import os

doc = App.newDocument("${safePartName}")

# Edit this path if FreeCAD cannot find the STEP file.
pl_step_path = r"""${params.plStepReferencePath}"""

rear_neck_outer_diameter = ${n(params.fixedBarrel.rearNeckOuterDiameterMm)}
rear_neck_inner_diameter = ${n(params.fixedBarrel.rearNeckInnerDiameterMm)}
rear_neck_length = ${n(params.fixedBarrel.rearNeckLengthMm)}

main_barrel_outer_diameter = ${n(params.fixedBarrel.mainBarrelOuterDiameterMm)}
main_barrel_inner_diameter = ${n(params.fixedBarrel.mainBarrelInnerDiameterMm)}
main_barrel_length = ${n(params.fixedBarrel.mainBarrelLengthMm)}
step_up_start_from_pl_flange = ${n(params.fixedBarrel.stepUpStartFromPLFlangeMm)}
pl_locking_clearance_length = ${n(params.fixedBarrel.plLockingClearanceLengthMm)}
pl_locking_clearance_diameter = ${n(params.fixedBarrel.plLockingClearanceDiameterMm ?? 0)}
include_main_barrel_section = ${b(params.includeMainBarrelSection)}

slot_count = ${slotCount}
slot_angle_offset_deg = ${n(params.fixedBarrel.slotAngleOffsetDeg)}
slot_length = ${n(params.fixedBarrel.slotLengthMm)}
slot_width = ${n(params.fixedBarrel.slotWidthMm)}
slot_start_z = ${n(params.fixedBarrel.slotStartZMm)}
slot_center_radius = ${n(slotCenterRadius)}

carrier_inner_diameter = ${n(params.slidingCarrier.innerDiameterMm)}
carrier_outer_diameter = ${n(params.slidingCarrier.outerDiameterMm)}
carrier_length = ${n(params.slidingCarrier.lengthMm)}
carrier_start_z = ${n(carrierStartZ)}
carrier_pin_hole_count = ${pinHoleCount}
carrier_pin_hole_angle_offset_deg = ${n(params.slidingCarrier.pinHoleAngleOffsetDeg)}
carrier_pin_hole_diameter = ${n(params.slidingCarrier.pinHoleDiameterMm)}
carrier_pin_hole_z = ${n(params.slidingCarrier.pinHoleZMm)}
add_pin_bosses = ${b(params.slidingCarrier.addPinBosses)}
pin_boss_diameter = ${n(pinBossDiameter)}
pin_boss_height = ${n(pinBossHeight)}
include_sliding_carrier = ${b(params.includeSlidingCarrier)}

include_guide_pins = ${b(params.includeGuidePins)}
guide_pin_diameter = ${n(params.guidePinDiameterMm)}
guide_pin_length = ${n(params.guidePinLengthMm)}

fuse_barrel_to_pl = ${b(params.fuseBarrelToPl)}
focus_prototype_start_mm = ${focusPrototypeStartLiteral}
recommended_prototype_travel_mm = ${recommendedTravelLiteral}
target_mount_throat_diameter_mm = ${targetMountThroatLiteral}

App.Console.PrintMessage("Check imported PL STEP orientation in FreeCAD. Rotate/align reference if needed.\\n")
App.Console.PrintMessage("This prototype uses straight axial slots instead of a cam focus mechanism.\\n")

macro_dir = os.path.dirname(__file__) if "__file__" in globals() else App.getUserMacroDir(True)
resolved_pl_step_path = pl_step_path if os.path.isabs(pl_step_path) else os.path.join(macro_dir, pl_step_path)

pl_imported_objects = []
imported_pl_reference_obj = None
try:
    before = set([obj.Name for obj in doc.Objects])
    ImportGui.insert(resolved_pl_step_path, doc.Name)
    after = set([obj.Name for obj in doc.Objects])
    inserted_names = [name for name in after if name not in before]
    for name in inserted_names:
        obj = doc.getObject(name)
        if obj:
            pl_imported_objects.append(obj)
    if len(pl_imported_objects) > 0:
        compound = Part.makeCompound(
            [obj.Shape for obj in pl_imported_objects if hasattr(obj, "Shape") and obj.Shape]
        )
        imported_pl_reference_obj = doc.addObject("Part::Feature", "Imported_PL_Lens_Tail")
        imported_pl_reference_obj.Shape = compound
except Exception as exc:
    App.Console.PrintWarning("Could not import PL STEP: %s\\n" % str(exc))
    App.Console.PrintWarning("Set pl_step_path to your local PL_Lens_Tail.STEP path and re-run.\\n")

if step_up_start_from_pl_flange < pl_locking_clearance_length:
    App.Console.PrintWarning("Barrel may block PL locking ring: step-up starts before locking clearance length.\\n")

if pl_locking_clearance_diameter > 0 and rear_neck_outer_diameter >= pl_locking_clearance_diameter:
    App.Console.PrintWarning("Rear neck outer diameter may collide with PL lock/throat area.\\n")

if slot_width < (${n(params.fixedBarrel.pinDiameterMm)} + 0.2):
    App.Console.PrintWarning("Slot may bind on guide pin. Add clearance.\\n")

if recommended_prototype_travel_mm is not None and slot_length < recommended_prototype_travel_mm:
    App.Console.PrintWarning("Slot length is shorter than calculated prototype focus travel.\\n")

if carrier_outer_diameter >= main_barrel_inner_diameter:
    App.Console.PrintWarning("Carrier will not slide inside fixed barrel.\\n")

if focus_prototype_start_mm is not None and focus_prototype_start_mm < 0:
    App.Console.PrintWarning("Carrier may need to travel behind PL flange (negative Z). Check PL throat clearance.\\n")
    if target_mount_throat_diameter_mm is not None and carrier_outer_diameter > (target_mount_throat_diameter_mm - 1.0):
        App.Console.PrintWarning("Carrier may collide with PL throat during behind-flange travel.\\n")

# Fixed PL barrel with axial slots
neck_outer = Part.makeCylinder(rear_neck_outer_diameter / 2.0, rear_neck_length)
neck_inner = Part.makeCylinder(rear_neck_inner_diameter / 2.0, rear_neck_length + 0.2)
neck_inner.translate(App.Vector(0, 0, -0.1))
neck = neck_outer.cut(neck_inner)

main_outer = Part.makeCylinder(main_barrel_outer_diameter / 2.0, main_barrel_length)
main_outer.translate(App.Vector(0, 0, step_up_start_from_pl_flange))
main_inner = Part.makeCylinder(main_barrel_inner_diameter / 2.0, main_barrel_length + 0.2)
main_inner.translate(App.Vector(0, 0, step_up_start_from_pl_flange - 0.1))
main = main_outer.cut(main_inner)

fixed_barrel = neck
if include_main_barrel_section:
    fixed_barrel = fixed_barrel.fuse(main)

wall_thickness = max((main_barrel_outer_diameter - main_barrel_inner_diameter) / 2.0, 0.4)
slot_depth = wall_thickness * 3.0
for i in range(slot_count):
    angle = slot_angle_offset_deg + (360.0 / slot_count) * i
    slot_box = Part.makeBox(slot_depth, slot_width, slot_length)
    slot_box.translate(App.Vector(slot_center_radius - wall_thickness, -slot_width / 2.0, slot_start_z))
    slot_box.rotate(App.Vector(0, 0, 0), App.Vector(0, 0, 1), angle)
    fixed_barrel = fixed_barrel.cut(slot_box)

fixed_barrel_obj = doc.addObject("Part::Feature", "Fixed_PL_Barrel_With_Axial_Slots")
fixed_barrel_obj.Shape = fixed_barrel

# Sliding optical carrier
if include_sliding_carrier:
    carrier_outer = Part.makeCylinder(carrier_outer_diameter / 2.0, carrier_length)
    carrier_inner = Part.makeCylinder(carrier_inner_diameter / 2.0, carrier_length + 0.2)
    carrier_inner.translate(App.Vector(0, 0, -0.1))
    carrier = carrier_outer.cut(carrier_inner)

    if add_pin_bosses:
        for i in range(carrier_pin_hole_count):
            angle = carrier_pin_hole_angle_offset_deg + (360.0 / carrier_pin_hole_count) * i
            boss = Part.makeCylinder(pin_boss_diameter / 2.0, pin_boss_height)
            boss.rotate(App.Vector(0, 0, 0), App.Vector(0, 1, 0), 90)
            boss.translate(App.Vector(carrier_outer_diameter / 2.0, 0, carrier_pin_hole_z))
            boss.rotate(App.Vector(0, 0, 0), App.Vector(0, 0, 1), angle)
            carrier = carrier.fuse(boss)

    for i in range(carrier_pin_hole_count):
        angle = carrier_pin_hole_angle_offset_deg + (360.0 / carrier_pin_hole_count) * i
        hole = Part.makeCylinder(carrier_pin_hole_diameter / 2.0, carrier_outer_diameter * 2.0)
        hole.rotate(App.Vector(0, 0, 0), App.Vector(0, 1, 0), 90)
        hole.translate(App.Vector(0, 0, carrier_pin_hole_z))
        hole.rotate(App.Vector(0, 0, 0), App.Vector(0, 0, 1), angle)
        carrier = carrier.cut(hole)

    carrier_obj = doc.addObject("Part::Feature", "Sliding_Optical_Carrier")
    carrier_obj.Shape = carrier
    carrier_obj.Placement.Base = App.Vector(0, 0, carrier_start_z)

if include_guide_pins and include_sliding_carrier:
    for i in range(slot_count):
        angle = slot_angle_offset_deg + (360.0 / slot_count) * i
        pin = Part.makeCylinder(guide_pin_diameter / 2.0, guide_pin_length)
        pin.rotate(App.Vector(0, 0, 0), App.Vector(0, 1, 0), 90)
        pin.translate(App.Vector(slot_center_radius, 0, carrier_start_z + carrier_pin_hole_z))
        pin.rotate(App.Vector(0, 0, 0), App.Vector(0, 0, 1), angle)
        pin_name = "Guide_Pin_Left" if i == 0 else ("Guide_Pin_Right" if i == 1 else ("Guide_Pin_%d" % (i + 1)))
        pin_obj = doc.addObject("Part::Feature", pin_name)
        pin_obj.Shape = pin

if fuse_barrel_to_pl and imported_pl_reference_obj and hasattr(imported_pl_reference_obj, "Shape"):
    try:
        fused_shape = imported_pl_reference_obj.Shape.fuse(fixed_barrel_obj.Shape)
        fused_obj = doc.addObject("Part::Feature", "Fused_PL_And_Fixed_Barrel")
        fused_obj.Shape = fused_shape
    except Exception as exc:
        App.Console.PrintWarning("Fuse failed: %s\\n" % str(exc))

doc.recompute()
`;
}

# Backward-compatible alias name used by earlier code.
export const generatePlAssemblyFreecadMacro = generateSlidingFocusAssemblyFreecadMacro;
