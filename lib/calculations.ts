import { getItemOpticalTypeLabel } from "@/lib/stackMeta";
import type { CadDefaults, StackItem } from "@/types";

const DEFAULT_MIN_CUP_WALL_THICKNESS_MM = 2.0;
const DEFAULT_SHARED_STACK_ROUNDING_INCREMENT_MM = 0.5;

function toPositive(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value;
}

function roundUpToIncrement(value: number, increment: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(increment) || increment <= 0) return value;
  return Math.ceil(value / increment) * increment;
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

function getTargetStackOuterDiameterForWarnings(items: StackItem[], defaults: CadDefaults): number {
  const manualTarget = toPositive(defaults.targetStackOuterDiameterMm);
  if (manualTarget > 0) return manualTarget;
  const largestGlass = getLargestGlassDiameter(items);
  if (largestGlass > 0) {
    const rawTarget = largestGlass + DEFAULT_MIN_CUP_WALL_THICKNESS_MM * 2;
    return Math.max(4, roundUpToIncrement(rawTarget, DEFAULT_SHARED_STACK_ROUNDING_INCREMENT_MM));
  }
  return 0;
}

function getNearestLensCupOuterDiameterOnSide(
  items: StackItem[],
  fromIndex: number,
  direction: -1 | 1,
  defaults: CadDefaults
): number {
  const targetStackOuterDiameter = getTargetStackOuterDiameterForWarnings(items, defaults);
  let index = fromIndex + direction;
  while (index >= 0 && index < items.length) {
    const cupSourceDiameter = getGlassMaxDiameterForCup(items[index]);
    if (cupSourceDiameter > 0) {
      if (targetStackOuterDiameter > 0) return targetStackOuterDiameter;
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

function getSpacerDesiredOpticalAirGapMm(item: Extract<StackItem, { type: "spacer" }>): number {
  const desired = toPositive(item.desiredOpticalAirGapMm);
  if (desired > 0) return desired;
  const fallback = toPositive(item.thicknessMm);
  return fallback > 0 ? fallback : 0;
}

function getSpacerPrintedThicknessMm(item: Extract<StackItem, { type: "spacer" }>): number {
  const printed = toPositive(item.physicalSpacerThicknessMm);
  if (printed > 0) return printed;
  return toPositive(item.thicknessMm);
}

function getSpacerThicknessSource(
  item: Extract<StackItem, { type: "spacer" }>
): "same_as_airspace" | "calculated_from_cup_offsets" | "manual_override" {
  return item.physicalSpacerThicknessSource === "calculated_from_cup_offsets" ||
    item.physicalSpacerThicknessSource === "manual_override"
    ? item.physicalSpacerThicknessSource
    : "same_as_airspace";
}

export function getItemAxialLength(item: StackItem): number {
  switch (item.type) {
    case "glass":
      return toPositive(item.thicknessMm);
    case "spacer":
      return getSpacerPrintedThicknessMm(item);
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
    .map((item) => getGlassMaxDiameterForCup(item))
    .filter((diameter) => diameter > 0);
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
      if (item.advancedProfile?.enabled) {
        const sections = item.advancedProfile.sections ?? [];
        const validSections = sections.filter(
          (section) => toPositive(section.diameterMm) > 0 && toPositive(section.lengthMm) > 0
        );
        if (!sections.length) {
          warnings.push(`${item.name || "Glass item"} has advanced profile enabled but no sections.`);
        }
        if (sections.length && validSections.length !== sections.length) {
          warnings.push(`${item.name || "Glass item"} advanced profile has section rows with missing diameter/length.`);
        }
        const sectionSum = validSections.reduce((sum, section) => sum + toPositive(section.lengthMm), 0);
        const totalLength = toPositive(item.advancedProfile.totalLengthMm);
        const diff = Math.abs(totalLength - sectionSum);
        if (totalLength > 0 && sectionSum > 0) {
          if (diff > 2) {
            warnings.push(`${item.name || "Glass item"} advanced profile section sum differs from total length by more than 2.0mm.`);
          } else if (diff > 1) {
            warnings.push(`${item.name || "Glass item"} advanced profile section sum differs from total length by more than 1.0mm.`);
          }
        }
        if (
          toPositive(item.advancedProfile.maxDiameterMm) > 0 &&
          validSections.some((section) => toPositive(section.diameterMm) > toPositive(item.advancedProfile?.maxDiameterMm))
        ) {
          warnings.push(`${item.name || "Glass item"} advanced profile max diameter is smaller than a section diameter.`);
        }
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
      const desiredOpticalAirGapMm = getSpacerDesiredOpticalAirGapMm(item);
      const printedSpacerThicknessMm = getSpacerPrintedThicknessMm(item);
      const thicknessSource = getSpacerThicknessSource(item);
      if (desiredOpticalAirGapMm <= 0) {
        warnings.push(`${item.name || "Spacer / Air Gap Ring"} desired optical air gap must be positive.`);
      }
      if (printedSpacerThicknessMm <= 0) {
        warnings.push(`${item.name || "Spacer / Air Gap Ring"} printed spacer thickness must be positive.`);
      }
      if (item.outerDiameterMm <= item.innerDiameterMm) {
        warnings.push("Spacer OD must be larger than spacer ID.");
      }
      if (printedSpacerThicknessMm < 0) {
        warnings.push("Printed spacer thickness is negative.");
      }
      if (thicknessSource === "calculated_from_cup_offsets") {
        warnings.push("Cup offset compensation unavailable; printed spacer may still equal desired airspace.");
      }
      if (desiredOpticalAirGapMm > 0 && printedSpacerThicknessMm > 0) {
        const diff = Math.abs(printedSpacerThicknessMm - desiredOpticalAirGapMm);
        if (diff > 0.001) {
          warnings.push("Desired optical airspace differs from printed spacer thickness.");
        }
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

  const targetStackOuterDiameterMm = getTargetStackOuterDiameterForWarnings(orderedItems, defaults);
  const largestGlassDiameterMm = getLargestGlassDiameter(orderedItems);
  if (
    targetStackOuterDiameterMm > 0 &&
    largestGlassDiameterMm > 0 &&
    targetStackOuterDiameterMm < largestGlassDiameterMm + DEFAULT_MIN_CUP_WALL_THICKNESS_MM * 2
  ) {
    warnings.push("Target stack OD is too small for largest glass diameter plus minimum cup wall thickness.");
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
  if (item.type === "spacer" && getSpacerDesiredOpticalAirGapMm(item) <= 0) {
    warnings.push("Desired optical airspace must be positive.");
  }
  if (item.type === "spacer" && getSpacerPrintedThicknessMm(item) <= 0) {
    warnings.push("Printed spacer thickness must be positive.");
  }
  if (
    item.type === "spacer" &&
    getSpacerDesiredOpticalAirGapMm(item) > 0 &&
    getSpacerPrintedThicknessMm(item) > 0 &&
    Math.abs(getSpacerDesiredOpticalAirGapMm(item) - getSpacerPrintedThicknessMm(item)) > 0.001
  ) {
    warnings.push("Desired optical airspace differs from printed spacer thickness.");
  }
  if (item.type === "spacer" && getSpacerThicknessSource(item) === "calculated_from_cup_offsets") {
    warnings.push("Cup offset compensation not yet fully applied; verify printed spacer thickness.");
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
