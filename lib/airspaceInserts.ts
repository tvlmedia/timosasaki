import type { AirspaceInsertedItem } from "@/types/measurement";

export type AirspaceInsertPositionMode =
  | "centered"
  | "distance_from_front"
  | "distance_from_rear"
  | "manual_split";

export type NormalizedAirspaceInsertedItem = Omit<
  AirspaceInsertedItem,
  "positionMode" | "positionMm"
> & {
  label: string;
  positionMode: AirspaceInsertPositionMode;
};

export type AirspaceInsertLayout = {
  item: NormalizedAirspaceInsertedItem;
  desiredOpticalAirGapMm: number;
  spacerBeforeMm: number;
  spacerAfterMm: number;
  totalMm: number;
  warnings: string[];
};

function toFinite(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function toPositive(value: unknown): number {
  const finite = toFinite(value);
  if (finite === undefined || finite <= 0) return 0;
  return finite;
}

function toNonNegative(value: unknown): number | undefined {
  const finite = toFinite(value);
  if (finite === undefined) return undefined;
  return Math.max(0, finite);
}

export function normalizeAirspaceInsertPositionMode(value: unknown): AirspaceInsertPositionMode {
  if (value === "distance_from_previous") return "distance_from_front";
  if (value === "distance_from_next") return "distance_from_rear";
  if (value === "manual") return "manual_split";
  if (
    value === "centered" ||
    value === "distance_from_front" ||
    value === "distance_from_rear" ||
    value === "manual_split"
  ) {
    return value;
  }
  return "centered";
}

export function normalizeAirspaceInsertedItem(
  item: AirspaceInsertedItem,
  fallbackLabel = "Inserted item"
): NormalizedAirspaceInsertedItem {
  const mode = normalizeAirspaceInsertPositionMode(item.positionMode);
  const legacyPositionMm = toNonNegative(item.positionMm);
  const distanceFromFrontMm = toNonNegative(item.distanceFromFrontMm);
  const distanceFromRearMm = toNonNegative(item.distanceFromRearMm);
  const spacerBeforeMm = toNonNegative(item.spacerBeforeMm);
  const spacerAfterMm = toNonNegative(item.spacerAfterMm);

  return {
    ...item,
    label: item.label?.trim() || fallbackLabel,
    thicknessMm: toPositive(item.thicknessMm),
    diskDiameterMm: toPositive(item.diskDiameterMm) > 0 ? toPositive(item.diskDiameterMm) : undefined,
    apertureDiameterMm: toPositive(item.apertureDiameterMm) > 0 ? toPositive(item.apertureDiameterMm) : undefined,
    positionMode: mode,
    distanceFromFrontMm:
      mode === "distance_from_front"
        ? (distanceFromFrontMm ?? legacyPositionMm)
        : distanceFromFrontMm,
    distanceFromRearMm:
      mode === "distance_from_rear"
        ? (distanceFromRearMm ?? legacyPositionMm)
        : distanceFromRearMm,
    spacerBeforeMm,
    spacerAfterMm
  };
}

export function normalizeAirspaceInsertedItems(
  items: AirspaceInsertedItem[] | undefined,
  fallbackLabelPrefix = "Inserted item"
): NormalizedAirspaceInsertedItem[] {
  return (items ?? []).map((item, index) =>
    normalizeAirspaceInsertedItem(item, `${fallbackLabelPrefix} ${index + 1}`)
  );
}

export function getAirspaceInsertedItemsTotalThicknessMm(items: AirspaceInsertedItem[] | undefined): number {
  return normalizeAirspaceInsertedItems(items).reduce((sum, item) => sum + toPositive(item.thicknessMm), 0);
}

function resolveManualSpacerBeforeMm(
  desiredOpticalAirGapMm: number,
  thicknessMm: number,
  spacerBeforeMm: number | undefined,
  spacerAfterMm: number | undefined
): number {
  if (spacerBeforeMm !== undefined) return spacerBeforeMm;
  if (spacerAfterMm !== undefined) return desiredOpticalAirGapMm - thicknessMm - spacerAfterMm;
  return 0;
}

function resolveManualSpacerAfterMm(
  desiredOpticalAirGapMm: number,
  thicknessMm: number,
  spacerBeforeMm: number | undefined,
  spacerAfterMm: number | undefined
): number {
  if (spacerAfterMm !== undefined) return spacerAfterMm;
  if (spacerBeforeMm !== undefined) return desiredOpticalAirGapMm - thicknessMm - spacerBeforeMm;
  return 0;
}

export function calculateAirspaceInsertLayout(
  desiredOpticalAirGapMmRaw: number,
  inputItem: AirspaceInsertedItem,
  context?: {
    targetStackOuterDiameterMm?: number;
    nearbyClearApertureMm?: number;
  }
): AirspaceInsertLayout {
  const item = normalizeAirspaceInsertedItem(inputItem);
  const desiredOpticalAirGapMm = Math.max(0, toFinite(desiredOpticalAirGapMmRaw) ?? 0);
  const thicknessMm = Math.max(0, item.thicknessMm);
  const warnings: string[] = [];

  let spacerBeforeMm = 0;
  let spacerAfterMm = 0;

  if (item.positionMode === "centered") {
    const remaining = desiredOpticalAirGapMm - thicknessMm;
    spacerBeforeMm = remaining / 2;
    spacerAfterMm = remaining / 2;
  } else if (item.positionMode === "distance_from_front") {
    spacerBeforeMm = toNonNegative(item.distanceFromFrontMm) ?? 0;
    spacerAfterMm = desiredOpticalAirGapMm - spacerBeforeMm - thicknessMm;
  } else if (item.positionMode === "distance_from_rear") {
    spacerAfterMm = toNonNegative(item.distanceFromRearMm) ?? 0;
    spacerBeforeMm = desiredOpticalAirGapMm - spacerAfterMm - thicknessMm;
  } else {
    const before = toNonNegative(item.spacerBeforeMm);
    const after = toNonNegative(item.spacerAfterMm);
    spacerBeforeMm = resolveManualSpacerBeforeMm(desiredOpticalAirGapMm, thicknessMm, before, after);
    spacerAfterMm = resolveManualSpacerAfterMm(desiredOpticalAirGapMm, thicknessMm, before, after);
  }

  if (thicknessMm >= desiredOpticalAirGapMm) {
    warnings.push("Inserted item is too thick for this airspace.");
  }
  if (spacerBeforeMm < 0 || spacerAfterMm < 0) {
    warnings.push("Insert position does not fit inside this airspace.");
  }
  if (spacerBeforeMm >= 0 && spacerBeforeMm < 0.4) {
    warnings.push("Calculated spacer is very thin for FDM printing.");
  }
  if (spacerAfterMm >= 0 && spacerAfterMm < 0.4) {
    warnings.push("Calculated spacer is very thin for FDM printing.");
  }
  if (item.positionMode === "manual_split") {
    const splitTotal = spacerBeforeMm + thicknessMm + spacerAfterMm;
    if (Math.abs(splitTotal - desiredOpticalAirGapMm) > 0.01) {
      warnings.push("Manual split must sum to desired optical airspace.");
    }
  }

  const targetStackOuterDiameterMm = toPositive(context?.targetStackOuterDiameterMm);
  if (
    targetStackOuterDiameterMm > 0 &&
    toPositive(item.diskDiameterMm) > 0 &&
    Math.abs((item.diskDiameterMm as number) - targetStackOuterDiameterMm) > 0.05
  ) {
    warnings.push("Inserted disk OD does not match stack OD.");
  }

  const nearbyClearApertureMm = toPositive(context?.nearbyClearApertureMm);
  if (nearbyClearApertureMm > 0 && toPositive(item.apertureDiameterMm) > 0) {
    if ((item.apertureDiameterMm as number) > nearbyClearApertureMm) {
      warnings.push("Iris/filter aperture may vignette.");
    }
  }

  return {
    item,
    desiredOpticalAirGapMm,
    spacerBeforeMm: Number(spacerBeforeMm.toFixed(3)),
    spacerAfterMm: Number(spacerAfterMm.toFixed(3)),
    totalMm: Number((spacerBeforeMm + thicknessMm + spacerAfterMm).toFixed(3)),
    warnings
  };
}

export function calculateAirspaceInsertLayouts(
  desiredOpticalAirGapMm: number,
  items: AirspaceInsertedItem[] | undefined,
  context?: {
    targetStackOuterDiameterMm?: number;
    nearbyClearApertureMm?: number;
  }
): AirspaceInsertLayout[] {
  return normalizeAirspaceInsertedItems(items).map((item) =>
    calculateAirspaceInsertLayout(desiredOpticalAirGapMm, item, context)
  );
}

export function createDefaultAirspaceInsertedItem(params: {
  id: string;
  type: AirspaceInsertedItem["type"];
  airspaceLabel: string;
  targetStackOuterDiameterMm?: number;
}): AirspaceInsertedItem {
  const labelBase =
    params.type === "iris"
      ? "Iris"
      : params.type === "filter"
        ? "Filter"
        : params.type === "diffusion"
          ? "Diffusion"
          : "Custom insert";
  const diskDiameterMm = toPositive(params.targetStackOuterDiameterMm);
  return {
    id: params.id,
    type: params.type,
    label: `${labelBase} inside ${params.airspaceLabel}`,
    diskDiameterMm: diskDiameterMm > 0 ? Number(diskDiameterMm.toFixed(3)) : undefined,
    apertureDiameterMm: params.type === "iris" || params.type === "filter" ? 14 : undefined,
    thicknessMm: 1.2,
    positionMode: "centered"
  };
}
