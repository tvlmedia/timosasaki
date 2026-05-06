import type {
  CamSleeveParams,
  DiffusionHolderParams,
  ElementCupParams,
  IrisDiskParams,
  MainBarrelParams,
  MovingCarrierParams,
  RetainingRingParams,
  SpacerRingParams
} from "@/types";
import { generateCamSleeveScad } from "@/lib/scad/camSleeve";
import { generateDiffusionHolderScad } from "@/lib/scad/diffusionHolder";
import { generateElementCupScad } from "@/lib/scad/elementCup";
import { generateIrisDiskScad } from "@/lib/scad/irisDisk";
import { generateMainBarrelScad } from "@/lib/scad/mainBarrel";
import { generateMovingCarrierScad } from "@/lib/scad/movingCarrier";
import { generateRetainingRingScad } from "@/lib/scad/retainingRing";
import { generateSpacerRingScad } from "@/lib/scad/spacerRing";

export {
  generateCamSleeveScad,
  generateDiffusionHolderScad,
  generateElementCupScad,
  generateIrisDiskScad,
  generateMainBarrelScad,
  generateMovingCarrierScad,
  generateRetainingRingScad,
  generateSpacerRingScad
};

export type ScadPayload =
  | { type: "element_cup"; params: ElementCupParams }
  | { type: "spacer_ring"; params: SpacerRingParams }
  | { type: "iris_disk"; params: IrisDiskParams }
  | { type: "diffusion_holder"; params: DiffusionHolderParams }
  | { type: "retaining_ring"; params: RetainingRingParams }
  | { type: "main_barrel"; params: MainBarrelParams }
  | { type: "moving_carrier"; params: MovingCarrierParams }
  | { type: "cam_sleeve"; params: CamSleeveParams };

export function generateScad(payload: ScadPayload): string {
  switch (payload.type) {
    case "element_cup":
      return generateElementCupScad(payload.params);
    case "spacer_ring":
      return generateSpacerRingScad(payload.params);
    case "iris_disk":
      return generateIrisDiskScad(payload.params);
    case "diffusion_holder":
      return generateDiffusionHolderScad(payload.params);
    case "retaining_ring":
      return generateRetainingRingScad(payload.params);
    case "main_barrel":
      return generateMainBarrelScad(payload.params);
    case "moving_carrier":
      return generateMovingCarrierScad(payload.params);
    case "cam_sleeve":
      return generateCamSleeveScad(payload.params);
    default:
      return "";
  }
}
