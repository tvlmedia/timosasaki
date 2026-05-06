import type { OpticalItemType, StackItem, StackItemType } from "@/types";

export const opticalTypeOptions: Array<{ value: OpticalItemType; label: string }> = [
  { value: "GLASS", label: "Glass" },
  { value: "AIR_GAP", label: "Air Gap (Set By Ring)" },
  { value: "IRIS", label: "Iris" },
  { value: "DIFFUSION", label: "Diffusion" },
  { value: "FILTER", label: "Filter" },
  { value: "EFFECT", label: "Effect" },
  { value: "SPACER", label: "Spacer / Air Gap Ring" },
  { value: "MOUNT", label: "Mount" },
  { value: "BARREL", label: "Barrel" },
  { value: "RETAINING_RING", label: "Retaining Ring" },
  { value: "CUSTOM", label: "Custom" }
];

const opticalTypeLabelByValue: Record<OpticalItemType, string> = Object.fromEntries(
  opticalTypeOptions.map((option) => [option.value, option.label])
) as Record<OpticalItemType, string>;

export const defaultOpticalTypeByStackType: Record<StackItemType, OpticalItemType> = {
  glass: "GLASS",
  spacer: "SPACER",
  iris: "IRIS",
  diffusion: "DIFFUSION",
  mount: "MOUNT",
  barrel: "BARREL",
  retaining_ring: "RETAINING_RING",
  custom: "CUSTOM"
};

export function getItemOpticalType(item: Pick<StackItem, "type" | "opticalType">): OpticalItemType {
  return item.opticalType ?? defaultOpticalTypeByStackType[item.type];
}

export function getOpticalTypeLabel(opticalType: OpticalItemType): string {
  return opticalTypeLabelByValue[opticalType];
}

export function getItemOpticalTypeLabel(item: Pick<StackItem, "type" | "opticalType">): string {
  return getOpticalTypeLabel(getItemOpticalType(item));
}
