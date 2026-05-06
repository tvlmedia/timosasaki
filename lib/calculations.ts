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

function getNeighboringGlassClearAperture(item?: StackItem): number {
  if (!item || item.type !== "glass") return 0;
  const explicitClearAperture = toPositive(item.clearApertureMm);
  if (explicitClearAperture > 0) return explicitClearAperture;

  // Warnings-only fallback when clear aperture is unknown:
  // assume usable optical diameter is glass diameter minus 2.0mm.
  return toPositive(item.diameterMm - 2.0);
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
      return toPositive(item.lengthMm);
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
    }

    if (item.type === "spacer") {
      if (toPositive(item.thicknessMm) === 0) {
        warnings.push(`${item.name || "Spacer"} thickness must be positive.`);
      }
      if (item.innerDiameterMm >= item.outerDiameterMm) {
        warnings.push(`${item.name || "Spacer"} inner diameter must be smaller than outer diameter.`);
      }

      const previousGlassClear = getNeighboringGlassClearAperture(orderedItems[i - 1]);
      const nextGlassClear = getNeighboringGlassClearAperture(orderedItems[i + 1]);
      const neighboringClear = Math.max(previousGlassClear, nextGlassClear);
      if (neighboringClear > 0 && item.innerDiameterMm < neighboringClear) {
        warnings.push(
          `${item.name || "Spacer"} inner diameter may vignette the neighboring glass clear aperture.`
        );
      }
    }

    if (item.type === "iris") {
      if (item.apertureDiameterMm > item.diskDiameterMm) {
        warnings.push("Iris aperture cannot be larger than disk diameter.");
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

  if (item.type === "iris" && item.apertureDiameterMm > item.diskDiameterMm) {
    warnings.push("Iris aperture cannot be larger than disk diameter.");
  }
  if (item.type === "diffusion" && item.clearCenterDiameterMm > item.diffusionOuterDiameterMm) {
    warnings.push("Diffusion clear center cannot be larger than diffusion outer diameter.");
  }
  if (
    (item.type === "spacer" || item.type === "barrel" || item.type === "retaining_ring") &&
    item.innerDiameterMm >= item.outerDiameterMm
  ) {
    warnings.push("Inner diameter must be smaller than outer diameter.");
  }
  if (item.type === "mount" && item.mountType === "PL") {
    warnings.push(
      "Do not use a 3D printed PL mount as a final load-bearing mount for valuable cameras/lenses."
    );
  }

  return warnings;
}
