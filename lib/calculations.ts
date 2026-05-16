import { getItemOpticalTypeLabel } from "@/lib/stackMeta";
import type { CadDefaults, StackItem } from "@/types";

function toPositive(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value;
}

function sorted(items: StackItem[]): StackItem[] {
  return [...items].sort((a, b) => a.positionIndex - b.positionIndex);
}

function getGlassClearApertureForWarnings(item?: StackItem): number {
  if (!item || item.type !== "glass") return 0;

  const explicitClearAperture = toPositive(item.clearApertureMm);
  if (explicitClearAperture > 0) return explicitClearAperture;

  // Warnings-only fallback when clear aperture is unknown.
  return toPositive(item.diameterMm - 2.0);
}

function getApertureCandidate(item?: StackItem): number {
  if (!item) return 0;
  if (item.type === "glass") return getGlassClearApertureForWarnings(item);
  if (item.type === "iris") return toPositive(item.apertureDiameterMm);
  return 0;
}

function getNearestApertureOnSide(items: StackItem[], fromIndex: number, direction: -1 | 1): number {
  let index = fromIndex + direction;
  while (index >= 0 && index < items.length) {
    const candidate = getApertureCandidate(items[index]);
    if (candidate > 0) return candidate;
    index += direction;
  }
  return 0;
}

function getNearbyAperture(items: StackItem[], index: number): number {
  const left = getNearestApertureOnSide(items, index, -1);
  const right = getNearestApertureOnSide(items, index, 1);
  return Math.max(left, right);
}

function getGlassMaxDiameterForCup(item?: StackItem): number {
  if (!item || item.type !== "glass") return 0;
  const candidates: number[] = [toPositive(item.diameterMm)];
  if (item.hasSteppedProfile) {
    candidates.push(toPositive(item.largeDiameterMm), toPositive(item.smallDiameterMm));
  }
  if (item.advancedProfile?.enabled) {
    candidates.push(toPositive(item.advancedProfile.maxDiameterMm));
    (item.advancedProfile.sections ?? []).forEach((section) => {
      candidates.push(toPositive(section.diameterMm));
    });
  }
  if (item.advancedProfileEnabled) {
    (item.profileSegments ?? []).forEach((segment) => {
      candidates.push(toPositive(segment.diameterMm));
    });
  }
  return Math.max(0, ...candidates);
}

function getNearestLensCupOuterDiameterOnSide(
  items: StackItem[],
  fromIndex: number,
  direction: -1 | 1,
  defaults: CadDefaults
): number {
  let index = fromIndex + direction;
  while (index >= 0 && index < items.length) {
    const cupSourceDiameter = getGlassMaxDiameterForCup(items[index]);
    if (cupSourceDiameter > 0) {
      return cupSourceDiameter + defaults.wallThicknessMm * 2;
    }
    index += direction;
  }
  return 0;
}

function getAdjacentLensCupOuterDiameter(items: StackItem[], index: number, defaults: CadDefaults): number {
  const left = getNearestLensCupOuterDiameterOnSide(items, index, -1, defaults);
  const right = getNearestLensCupOuterDiameterOnSide(items, index, 1, defaults);
  return Math.max(left, right);
}

function getSpacerWallWidth(item: Extract<StackItem, { type: "spacer" }>): number {
  return (toPositive(item.outerDiameterMm) - toPositive(item.innerDiameterMm)) / 2;
}

export function getItemAxialLength(item: StackItem): number {
  switch (item.type) {
    case "glass":
      return toPositive(item.thicknessMm);
    case "spacer":
      return toPositive(item.thicknessMm);
    case "iris":
      return toPositive(item.thicknessMm);
    case "diffusion":
      return toPositive(item.thicknessMm);
    case "mount":
      return 0;
    case "barrel":
      return item.contributesToOpticalStackLength ? toPositive(item.lengthMm) : 0;
    case "retaining_ring":
      return toPositive(item.thicknessMm);
    case "custom":
      return toPositive(item.lengthMm);
    default:
      return 0;
  }
}

export function getTotalStackLength(items: StackItem[]): number {
  return sorted(items).reduce((acc, item) => acc + getItemAxialLength(item), 0);
}

export function getLargestGlassDiameter(items: StackItem[]): number {
  const diameters = items
    .filter((item): item is Extract<StackItem, { type: "glass" }> => item.type === "glass")
    .map((item) => toPositive(item.diameterMm));

  return diameters.length ? Math.max(...diameters) : 0;
}

export function getRecommendedBarrelInnerDiameter(items: StackItem[], defaults: CadDefaults): number {
  const largestGlass = getLargestGlassDiameter(items);
  const suggested = largestGlass + 2 * defaults.radialClearanceMm + 2;
  return Math.max(suggested, defaults.defaultInnerDiameterMm);
}

export function getRecommendedBarrelOuterDiameter(items: StackItem[], defaults: CadDefaults): number {
  const inner = getRecommendedBarrelInnerDiameter(items, defaults);
  return inner + 2 * defaults.wallThicknessMm;
}

export function getStackWarnings(items: StackItem[], defaults: CadDefaults): string[] {
  const warnings: string[] = [];
  const orderedItems = sorted(items);

  for (let i = 0; i < orderedItems.length; i += 1) {
    const item = orderedItems[i];

    if (!item.name?.trim()) {
      warnings.push(`Stack item at index ${i + 1} has no name.`);
    }

    if (item.type === "glass") {
      if (toPositive(item.diameterMm) === 0) {
        warnings.push(`${item.name || "Glass item"} diameter is missing.`);
      }
      if (toPositive(item.thicknessMm) === 0) {
        warnings.push(`${item.name || "Glass item"} thickness must be positive.`);
      }
      if (item.advancedProfileEnabled) {
        const segments = item.profileSegments ?? [];
        if (!segments.length) {
          warnings.push(`${item.name || "Glass item"} has advanced profile enabled but no profile segments.`);
        } else {
          const invalidSegment = segments.find(
            (segment) => toPositive(segment.diameterMm) === 0 || toPositive(segment.depthMm) === 0
          );
          if (invalidSegment) {
            warnings.push(`${item.name || "Glass item"} has profile segments with non-positive diameter or depth.`);
          }

          const profileDepth = segments.reduce((sum, segment) => sum + toPositive(segment.depthMm), 0);
          if (profileDepth > 0 && Math.abs(profileDepth - toPositive(item.thicknessMm)) > 0.02) {
            warnings.push(
              `${item.name || "Glass item"} profile depth (${profileDepth.toFixed(2)}mm) does not match thickness (${toPositive(item.thicknessMm).toFixed(2)}mm).`
            );
          }
        }
      }
    }

    if (item.type === "spacer") {
      if (toPositive(item.thicknessMm) === 0) {
        warnings.push(`${item.name || "Spacer / Air Gap Ring"} thickness must be positive.`);
      }
      if (item.outerDiameterMm <= item.innerDiameterMm) {
        warnings.push("Spacer OD must be larger than spacer ID.");
      }

      const nearbyAperture = getNearbyAperture(orderedItems, i);
      if (nearbyAperture > 0 && item.innerDiameterMm < nearbyAperture) {
        warnings.push("Spacer ID may vignette.");
      }

      const adjacentCupOuterDiameter = getAdjacentLensCupOuterDiameter(orderedItems, i, defaults);
      if (adjacentCupOuterDiameter > 0 && Math.abs(item.outerDiameterMm - adjacentCupOuterDiameter) > 0.5) {
        warnings.push("Spacer OD does not match adjacent lens cup OD; stack may not align.");
      }

      if (getSpacerWallWidth(item) < 1.2) {
        warnings.push(`${item.name || "Spacer / Air Gap Ring"} wall may be fragile for FDM printing.`);
      }
    }

    if (item.type === "iris") {
      if (item.apertureDiameterMm > item.diskDiameterMm) {
        warnings.push("Iris aperture cannot be larger than disk diameter.");
      }

      const nearbyAperture = getNearbyAperture(orderedItems, i);
      if (nearbyAperture > 0 && item.apertureDiameterMm > nearbyAperture) {
        warnings.push(`${item.name || "Iris"} aperture may exceed nearby clear aperture.`);
      }

      if (item.isOval && item.ovalWidthMm && item.ovalHeightMm) {
        if (item.ovalWidthMm > item.diskDiameterMm || item.ovalHeightMm > item.diskDiameterMm) {
          warnings.push(`${item.name || "Oval iris"} oval dimensions exceed disk diameter.`);
        }
      }
    }

    if (item.type === "diffusion") {
      if (item.clearCenterDiameterMm > item.diffusionOuterDiameterMm) {
        warnings.push("Diffusion clear center cannot be larger than diffusion outer diameter.");
      }
      if (item.diffusionOuterDiameterMm > item.diskDiameterMm) {
        warnings.push(`${item.name || "Diffusion disk"} diffusion outer diameter exceeds disk diameter.`);
      }

      const nearbyAperture = getNearbyAperture(orderedItems, i);
      if (nearbyAperture > 0 && item.diskDiameterMm < nearbyAperture) {
        warnings.push(
          `${item.name || getItemOpticalTypeLabel(item)} disk diameter may clip nearby clear aperture.`
        );
      }
    }

    if (item.type === "barrel") {
      if (item.innerDiameterMm >= item.outerDiameterMm) {
        warnings.push(`${item.name || "Barrel"} inner diameter must be smaller than outer diameter.`);
      }
    }

    if (item.type === "retaining_ring") {
      if (item.innerDiameterMm >= item.outerDiameterMm) {
        warnings.push(`${item.name || "Retaining ring"} inner diameter must be smaller than outer diameter.`);
      }
    }
  }

  if (defaults.wallThicknessMm < 1.2) {
    warnings.push("Wall thickness under 1.2mm may be fragile for FDM printing.");
  }
  if (defaults.printToleranceMm < 0.1) {
    warnings.push("Generated cup seat has less than 0.10mm clearance. Increase tolerance.");
  }

  return warnings;
}

export function getPartWarnings(item: StackItem, defaults: CadDefaults): string[] {
  const warnings: string[] = [];

  if (defaults.printToleranceMm < 0.1) {
    warnings.push("Generated cup seat has less than 0.10mm clearance. Increase tolerance.");
  }
  if (defaults.wallThicknessMm < 1.2) {
    warnings.push("Wall thickness under 1.2mm may be fragile for FDM printing.");
  }

  if (item.type === "spacer" && getSpacerWallWidth(item) < 1.2) {
    warnings.push("Spacer wall may be fragile for FDM printing.");
  }
  if (item.type === "spacer" && item.outerDiameterMm <= item.innerDiameterMm) {
    warnings.push("Spacer OD must be larger than spacer ID.");
  }
  if (item.type === "iris" && item.apertureDiameterMm > item.diskDiameterMm) {
    warnings.push("Iris aperture cannot be larger than disk diameter.");
  }
  if (item.type === "diffusion" && item.clearCenterDiameterMm > item.diffusionOuterDiameterMm) {
    warnings.push("Diffusion clear center cannot be larger than diffusion outer diameter.");
  }
  if ((item.type === "barrel" || item.type === "retaining_ring") && item.innerDiameterMm >= item.outerDiameterMm) {
    warnings.push("Inner diameter must be smaller than outer diameter.");
  }
  if (item.type === "mount" && item.mountType === "PL") {
    warnings.push(
      "Do not use a 3D printed PL mount as a final load-bearing mount for valuable cameras/lenses."
    );
  }

  return warnings;
}
