import type { SpacerRingParams } from "@/types";
import { generateSpacerRingFreecadMacro } from "@/lib/freecad/spacerRingMacro";

export type FreecadPayload = {
  type: "spacer_ring";
  params: SpacerRingParams;
};

export function generateFreecadMacro(payload: FreecadPayload): string {
  switch (payload.type) {
    case "spacer_ring":
      return generateSpacerRingFreecadMacro(payload.params);
    default:
      return "";
  }
}

export { generateSpacerRingFreecadMacro };
