import type {
  ElementCupParams,
  FixedPLBarrelWithSlotsParams,
  SlidingFocusAssemblyMacroParams,
  SlidingOpticalCarrierParams,
  SpacerRingParams
} from "@/types";
import { generateElementCupFreecadMacro } from "@/lib/freecad/elementCupMacro";
import { generateFixedPlBarrelWithSlotsFreecadMacro } from "@/lib/freecad/fixedPlBarrelWithSlotsMacro";
import { generateSlidingFocusAssemblyFreecadMacro } from "@/lib/freecad/plAssemblyMacro";
import { generateSlidingOpticalCarrierFreecadMacro } from "@/lib/freecad/slidingOpticalCarrierMacro";
import { generateSpacerRingFreecadMacro } from "@/lib/freecad/spacerRingMacro";

export type FreecadPayload =
  | {
      type: "spacer_ring";
      params: SpacerRingParams;
    }
  | {
      type: "element_cup";
      params: ElementCupParams;
    }
  | {
      type: "fixed_pl_barrel_with_slots";
      params: FixedPLBarrelWithSlotsParams;
    }
  | {
      type: "sliding_optical_carrier";
      params: SlidingOpticalCarrierParams;
    }
  | {
      type: "sliding_focus_assembly";
      params: SlidingFocusAssemblyMacroParams;
    };

export function generateFreecadMacro(payload: FreecadPayload): string {
  switch (payload.type) {
    case "spacer_ring":
      return generateSpacerRingFreecadMacro(payload.params);
    case "element_cup":
      return generateElementCupFreecadMacro(payload.params);
    case "fixed_pl_barrel_with_slots":
      return generateFixedPlBarrelWithSlotsFreecadMacro(payload.params);
    case "sliding_optical_carrier":
      return generateSlidingOpticalCarrierFreecadMacro(payload.params);
    case "sliding_focus_assembly":
      return generateSlidingFocusAssemblyFreecadMacro(payload.params);
    default:
      return "";
  }
}

export {
  generateElementCupFreecadMacro,
  generateFixedPlBarrelWithSlotsFreecadMacro,
  generateSlidingFocusAssemblyFreecadMacro,
  generateSlidingOpticalCarrierFreecadMacro,
  generateSpacerRingFreecadMacro
};
