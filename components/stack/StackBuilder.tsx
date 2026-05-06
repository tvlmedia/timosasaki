"use client";

import { useMemo, useState } from "react";
import { getRecommendedBarrelInnerDiameter } from "@/lib/calculations";
import { createId } from "@/lib/ids";
import { defaultOpticalTypeByStackType, getItemOpticalType, opticalTypeOptions } from "@/lib/stackMeta";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { NumberInput } from "@/components/common/NumberInput";
import { Select } from "@/components/common/Select";
import { WarningBox } from "@/components/common/WarningBox";
import { AddStackItemModal } from "@/components/stack/AddStackItemModal";
import { StackItemCard } from "@/components/stack/StackItemCard";
import { StackPreview2D } from "@/components/stack/StackPreview2D";
import { StackSummary } from "@/components/stack/StackSummary";
import type { CadDefaults, LensProject, OpticalItemType, StackItem, StackItemType } from "@/types";

function normalizePositions(items: StackItem[]): StackItem[] {
  return items
    .slice()
    .sort((a, b) => a.positionIndex - b.positionIndex)
    .map((item, index) => ({ ...item, positionIndex: index }));
}

function createStackItem(type: StackItemType, index: number): StackItem {
  const id = createId(type);
  const opticalType = defaultOpticalTypeByStackType[type];
  switch (type) {
    case "glass":
      return {
        id,
        name: "New glass",
        type,
        opticalType,
        positionIndex: index,
        diameterMm: 30,
        thicknessMm: 4,
        flipped: false
      };
    case "spacer":
      return {
        id,
        name: "New spacer / air gap ring",
        type,
        opticalType,
        positionIndex: index,
        innerDiameterMm: 28,
        outerDiameterMm: 38,
        thicknessMm: 1,
        hasAntiReflectionGrooves: false,
        chamferEnabled: false,
        chamferMm: 0.2
      };
    case "iris":
      return {
        id,
        name: "New iris",
        type,
        opticalType,
        positionIndex: index,
        diskDiameterMm: 30,
        apertureDiameterMm: 14,
        thicknessMm: 1.2,
        isOval: false
      };
    case "diffusion":
      return {
        id,
        name: "New diffusion",
        type,
        opticalType,
        positionIndex: index,
        diskDiameterMm: 30,
        clearCenterDiameterMm: 12,
        diffusionOuterDiameterMm: 24,
        thicknessMm: 1
      };
    case "mount":
      return {
        id,
        name: "New mount",
        type,
        opticalType,
        positionIndex: index,
        mountType: "PL",
        flangeDistanceMm: 52,
        innerClearanceMm: 40
      };
    case "barrel":
      return {
        id,
        name: "New barrel",
        type,
        opticalType,
        positionIndex: index,
        innerDiameterMm: 40,
        outerDiameterMm: 44,
        lengthMm: 40,
        screwHoleCount: 0
      };
    case "retaining_ring":
      return {
        id,
        name: "New retaining ring",
        type,
        opticalType,
        positionIndex: index,
        innerDiameterMm: 30,
        outerDiameterMm: 34,
        thicknessMm: 1.5,
        notchCount: 2
      };
    case "custom":
      return {
        id,
        name: "New custom item",
        type,
        opticalType,
        positionIndex: index,
        lengthMm: 0
      };
  }
}

function toPositive(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

function getApertureCandidate(item?: StackItem): number {
  if (!item) return 0;
  if (item.type === "glass") return toPositive(item.clearApertureMm ?? item.diameterMm - 2);
  if (item.type === "iris") return toPositive(item.apertureDiameterMm);
  if (item.type === "diffusion") return toPositive(item.clearCenterDiameterMm);
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

function getReferenceBarrelInnerDiameter(items: StackItem[], defaults: CadDefaults, index: number): number {
  const barrelCandidates = items
    .map((item, itemIndex) => ({ item, itemIndex }))
    .filter(
      (entry): entry is { item: Extract<StackItem, { type: "barrel" }>; itemIndex: number } =>
        entry.item.type === "barrel" && toPositive(entry.item.innerDiameterMm) > 0
    );

  if (!barrelCandidates.length) {
    return getRecommendedBarrelInnerDiameter(items, defaults);
  }

  const closest = barrelCandidates.reduce((best, current) => {
    const bestDistance = Math.abs(best.itemIndex - index);
    const currentDistance = Math.abs(current.itemIndex - index);
    return currentDistance < bestDistance ? current : best;
  });

  return toPositive(closest.item.innerDiameterMm);
}

function deriveSpacerRingDimensions(items: StackItem[], defaults: CadDefaults, index: number): {
  innerDiameterMm: number;
  outerDiameterMm: number;
} {
  const barrelInner = getReferenceBarrelInnerDiameter(items, defaults, index);
  const fitClearancePerSide = Math.max(defaults.radialClearanceMm + defaults.printToleranceMm, 0.25);
  const outerDiameterMm = Math.max(12, barrelInner - fitClearancePerSide * 2);

  const nearbyAperture = getNearbyAperture(items, index);
  const preferredWallWidth = 1.2;
  const minimumWallWidth = 0.8;
  const preferredInner = outerDiameterMm - preferredWallWidth * 2;
  const minimumUsefulInner = nearbyAperture > 0 ? nearbyAperture + 0.4 : 0;
  const hardMaximumInner = outerDiameterMm - minimumWallWidth * 2;

  const innerDiameterMm = Math.max(
    4,
    Math.min(
      hardMaximumInner,
      Math.max(minimumUsefulInner, preferredInner > 0 ? preferredInner : outerDiameterMm - minimumWallWidth * 2)
    )
  );

  return {
    innerDiameterMm: Number(innerDiameterMm.toFixed(2)),
    outerDiameterMm: Number(outerDiameterMm.toFixed(2))
  };
}

function validateItem(item: StackItem): string[] {
  const errors: string[] = [];
  if (!item.name.trim()) errors.push("Stack item name is required.");

  const invalid = (value: number | undefined) => typeof value !== "number" || !Number.isFinite(value) || value <= 0;

  switch (item.type) {
    case "glass":
      if (invalid(item.diameterMm)) errors.push("Glass diameter must be positive.");
      if (invalid(item.thicknessMm)) errors.push("Glass thickness must be positive.");
      break;
    case "spacer":
      if (invalid(item.innerDiameterMm) || invalid(item.outerDiameterMm) || invalid(item.thicknessMm)) {
        errors.push("Spacer / Air Gap Ring dimensions must be positive.");
      }
      if (item.innerDiameterMm >= item.outerDiameterMm) {
        errors.push("Spacer / Air Gap Ring inner diameter must be smaller than outer.");
      }
      if (item.chamferEnabled && invalid(item.chamferMm)) {
        errors.push("Chamfer must be positive when enabled.");
      }
      break;
    case "iris":
      if (invalid(item.diskDiameterMm) || invalid(item.apertureDiameterMm) || invalid(item.thicknessMm)) {
        errors.push("Iris dimensions must be positive.");
      }
      if (item.apertureDiameterMm > item.diskDiameterMm) errors.push("Aperture cannot be larger than disk diameter.");
      break;
    case "diffusion":
      if (
        invalid(item.diskDiameterMm) ||
        invalid(item.clearCenterDiameterMm) ||
        invalid(item.diffusionOuterDiameterMm) ||
        invalid(item.thicknessMm)
      ) {
        errors.push("Diffusion dimensions must be positive.");
      }
      if (item.clearCenterDiameterMm > item.diffusionOuterDiameterMm) {
        errors.push("Clear center cannot be larger than diffusion outer diameter.");
      }
      break;
    case "barrel":
      if (invalid(item.innerDiameterMm) || invalid(item.outerDiameterMm) || invalid(item.lengthMm)) {
        errors.push("Barrel dimensions must be positive.");
      }
      if (item.innerDiameterMm >= item.outerDiameterMm) errors.push("Inner diameter must be smaller than outer diameter.");
      break;
    case "retaining_ring":
      if (invalid(item.innerDiameterMm) || invalid(item.outerDiameterMm) || invalid(item.thicknessMm)) {
        errors.push("Retaining ring dimensions must be positive.");
      }
      if (item.innerDiameterMm >= item.outerDiameterMm) errors.push("Inner diameter must be smaller than outer diameter.");
      break;
    case "custom":
      if (item.lengthMm !== undefined && item.lengthMm < 0) errors.push("Custom length cannot be negative.");
      break;
    default:
      break;
  }

  return errors;
}

export function StackBuilder({
  project,
  onProjectChange
}: {
  project: LensProject;
  onProjectChange: (project: LensProject) => void;
}) {
  const orderedItems = useMemo(() => normalizePositions(project.stackItems), [project.stackItems]);
  const [selectedId, setSelectedId] = useState<string | undefined>(orderedItems[0]?.id);

  const selectedItem = orderedItems.find((item) => item.id === selectedId) ?? orderedItems[0];
  const selectedErrors = selectedItem ? validateItem(selectedItem) : [];

  const commitItems = (nextItems: StackItem[]) => {
    const normalized = normalizePositions(nextItems);
    onProjectChange({
      ...project,
      updatedAt: new Date().toISOString(),
      stackItems: normalized
    });
  };

  const updateItem = (id: string, updater: (item: StackItem) => StackItem) => {
    commitItems(orderedItems.map((item) => (item.id === id ? updater(item) : item)));
  };

  const updateTypedItem = <T extends StackItem["type"]>(
    id: string,
    type: T,
    updater: (item: Extract<StackItem, { type: T }>) => Extract<StackItem, { type: T }>
  ) => {
    updateItem(id, (item) => {
      if (item.type !== type) return item;
      return updater(item as Extract<StackItem, { type: T }>);
    });
  };

  const moveItem = (id: string, direction: -1 | 1) => {
    const index = orderedItems.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= orderedItems.length) return;
    if (orderedItems[index].locked || orderedItems[target].locked) return;

    const next = orderedItems.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    commitItems(next);
  };

  const addItem = (type: StackItemType) => {
    let newItem = createStackItem(type, orderedItems.length);
    if (newItem.type === "spacer") {
      const auto = deriveSpacerRingDimensions(orderedItems, project.cadDefaults, orderedItems.length);
      newItem = { ...newItem, ...auto };
    }
    commitItems([...orderedItems, newItem]);
    setSelectedId(newItem.id);
  };

  const duplicateItem = (id: string) => {
    const source = orderedItems.find((item) => item.id === id);
    if (!source) return;
    const clone: StackItem = {
      ...source,
      id: createId(source.type),
      name: `${source.name} copy`,
      locked: false
    } as StackItem;
    const index = orderedItems.findIndex((item) => item.id === id);
    const next = orderedItems.slice();
    next.splice(index + 1, 0, clone);
    commitItems(next);
    setSelectedId(clone.id);
  };

  const deleteItem = (id: string) => {
    commitItems(orderedItems.filter((item) => item.id !== id));
    if (selectedId === id) {
      setSelectedId(undefined);
    }
  };

  const autoFitSpacer = (id: string) => {
    const index = orderedItems.findIndex((item) => item.id === id);
    if (index < 0) return;
    const target = orderedItems[index];
    if (target.type !== "spacer") return;
    const auto = deriveSpacerRingDimensions(orderedItems, project.cadDefaults, index);
    updateTypedItem(id, "spacer", (entry) => ({ ...entry, ...auto }));
  };

  const autoFitAllSpacers = () => {
    const adjusted = orderedItems.map((item, index) => {
      if (item.type !== "spacer") return item;
      const auto = deriveSpacerRingDimensions(orderedItems, project.cadDefaults, index);
      return { ...item, ...auto };
    });
    commitItems(adjusted);
  };

  return (
    <div className="space-y-4">
      <AddStackItemModal onAdd={addItem} />
      <div className="flex justify-end">
        <Button variant="ghost" onClick={autoFitAllSpacers} className="text-xs">
          Auto-fit all spacer rings to barrel
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr_360px]">
        <section className="panel space-y-2 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-labMuted">Stack Items (Front to Sensor)</h3>
          {orderedItems.length === 0 && <p className="text-sm text-labMuted">No stack items yet.</p>}
          {orderedItems.map((item) => (
            <StackItemCard
              key={item.id}
              item={item}
              selected={selectedItem?.id === item.id}
              onSelect={() => setSelectedId(item.id)}
              onMoveUp={() => moveItem(item.id, -1)}
              onMoveDown={() => moveItem(item.id, 1)}
              onDuplicate={() => duplicateItem(item.id)}
              onDelete={() => deleteItem(item.id)}
              onToggleLock={() => updateItem(item.id, (entry) => ({ ...entry, locked: !entry.locked }))}
            />
          ))}
        </section>

        <section className="space-y-4">
          <StackPreview2D items={orderedItems} selectedId={selectedItem?.id} onSelect={setSelectedId} />
          <StackSummary items={orderedItems} defaults={project.cadDefaults} />
        </section>

        <section className="panel p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-labMuted">Item Editor</h3>
          {!selectedItem && <p className="text-sm text-labMuted">Select an item to edit.</p>}
          {selectedItem && (
            <div className="space-y-3">
              <Input
                label="Item name"
                value={selectedItem.name}
                onChange={(event) =>
                  updateItem(selectedItem.id, (entry) => ({
                    ...entry,
                    name: event.target.value
                  }))
                }
              />
              <Select
                label="Type"
                value={getItemOpticalType(selectedItem)}
                onChange={(event) =>
                  updateItem(selectedItem.id, (entry) => ({
                    ...entry,
                    opticalType: event.target.value as OpticalItemType
                  }))
                }
              >
                {opticalTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Input
                label="Notes"
                value={selectedItem.notes ?? ""}
                onChange={(event) =>
                  updateItem(selectedItem.id, (entry) => ({
                    ...entry,
                    notes: event.target.value
                  }))
                }
              />

              {selectedItem.type === "glass" && (
                <>
                  <NumberInput
                    label="Diameter (mm)"
                    value={selectedItem.diameterMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "glass", (entry) => ({
                        ...entry,
                        diameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Thickness (mm)"
                    value={selectedItem.thicknessMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "glass", (entry) => ({
                        ...entry,
                        thicknessMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Clear aperture / usable optical diameter (mm)"
                    value={selectedItem.clearApertureMm ?? ""}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "glass", (entry) => ({
                        ...entry,
                        clearApertureMm: event.target.value ? Number(event.target.value) : undefined
                      }))
                    }
                  />
                  <p className="text-xs leading-relaxed text-labMuted">
                    Optional. Leave empty if unknown. This is the usable optical diameter, not the physical glass
                    diameter. Used for vignetting and retaining-lip warnings.
                  </p>
                  <label className="flex items-center gap-2 text-sm text-labMuted">
                    <input
                      type="checkbox"
                      checked={selectedItem.flipped}
                      onChange={(event) =>
                        updateTypedItem(selectedItem.id, "glass", (entry) => ({
                          ...entry,
                          flipped: event.target.checked
                        }))
                      }
                    />
                    Flipped
                  </label>
                </>
              )}

              {selectedItem.type === "spacer" && (
                <>
                  <p className="rounded-lg border border-labBorder bg-[#0b0b0b] px-3 py-2 text-xs leading-relaxed text-labMuted">
                    A physical ring/shim that sets the optical air gap between parts. The inner hole stays open for
                    the light path.
                  </p>
                  <Button
                    variant="ghost"
                    className="w-full text-xs"
                    onClick={() => autoFitSpacer(selectedItem.id)}
                  >
                    Auto-fit ring diameter to barrel
                  </Button>
                  <NumberInput
                    label="Inner diameter (mm)"
                    value={selectedItem.innerDiameterMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "spacer", (entry) => ({
                        ...entry,
                        innerDiameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Outer diameter (mm)"
                    value={selectedItem.outerDiameterMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "spacer", (entry) => ({
                        ...entry,
                        outerDiameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Thickness (mm)"
                    value={selectedItem.thicknessMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "spacer", (entry) => ({
                        ...entry,
                        thicknessMm: Number(event.target.value)
                      }))
                    }
                  />
                  <label className="flex items-center gap-2 text-sm text-labMuted">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedItem.hasAntiReflectionGrooves)}
                      onChange={(event) =>
                        updateTypedItem(selectedItem.id, "spacer", (entry) => ({
                          ...entry,
                          hasAntiReflectionGrooves: event.target.checked
                        }))
                      }
                    />
                    Anti-reflection grooves
                  </label>
                  <label className="flex items-center gap-2 text-sm text-labMuted">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedItem.chamferEnabled)}
                      onChange={(event) =>
                        updateTypedItem(selectedItem.id, "spacer", (entry) => ({
                          ...entry,
                          chamferEnabled: event.target.checked
                        }))
                      }
                    />
                    Chamfer enabled
                  </label>
                  {selectedItem.chamferEnabled && (
                    <NumberInput
                      label="Chamfer (mm)"
                      value={selectedItem.chamferMm ?? ""}
                      min={0}
                      onChange={(event) =>
                        updateTypedItem(selectedItem.id, "spacer", (entry) => ({
                          ...entry,
                          chamferMm: event.target.value ? Number(event.target.value) : undefined
                        }))
                      }
                    />
                  )}
                </>
              )}

              {selectedItem.type === "iris" && (
                <>
                  <NumberInput
                    label="Disk diameter (mm)"
                    value={selectedItem.diskDiameterMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "iris", (entry) => ({
                        ...entry,
                        diskDiameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Aperture diameter (mm)"
                    value={selectedItem.apertureDiameterMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "iris", (entry) => ({
                        ...entry,
                        apertureDiameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Thickness (mm)"
                    value={selectedItem.thicknessMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "iris", (entry) => ({
                        ...entry,
                        thicknessMm: Number(event.target.value)
                      }))
                    }
                  />
                  <label className="flex items-center gap-2 text-sm text-labMuted">
                    <input
                      type="checkbox"
                      checked={selectedItem.isOval}
                      onChange={(event) =>
                        updateTypedItem(selectedItem.id, "iris", (entry) => ({
                          ...entry,
                          isOval: event.target.checked
                        }))
                      }
                    />
                    Oval aperture
                  </label>
                  {selectedItem.isOval && (
                    <>
                      <NumberInput
                        label="Oval width (mm)"
                        value={selectedItem.ovalWidthMm ?? ""}
                        min={0}
                        onChange={(event) =>
                          updateTypedItem(selectedItem.id, "iris", (entry) => ({
                            ...entry,
                            ovalWidthMm: event.target.value ? Number(event.target.value) : undefined
                          }))
                        }
                      />
                      <NumberInput
                        label="Oval height (mm)"
                        value={selectedItem.ovalHeightMm ?? ""}
                        min={0}
                        onChange={(event) =>
                          updateTypedItem(selectedItem.id, "iris", (entry) => ({
                            ...entry,
                            ovalHeightMm: event.target.value ? Number(event.target.value) : undefined
                          }))
                        }
                      />
                    </>
                  )}
                  <label className="flex items-center gap-2 text-sm text-labMuted">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedItem.tabEnabled)}
                      onChange={(event) =>
                        updateTypedItem(selectedItem.id, "iris", (entry) => ({
                          ...entry,
                          tabEnabled: event.target.checked
                        }))
                      }
                    />
                    Add tab
                  </label>
                  {selectedItem.tabEnabled && (
                    <>
                      <NumberInput
                        label="Tab width (mm)"
                        value={selectedItem.tabWidthMm ?? ""}
                        min={0}
                        onChange={(event) =>
                          updateTypedItem(selectedItem.id, "iris", (entry) => ({
                            ...entry,
                            tabWidthMm: event.target.value ? Number(event.target.value) : undefined
                          }))
                        }
                      />
                      <NumberInput
                        label="Tab length (mm)"
                        value={selectedItem.tabLengthMm ?? ""}
                        min={0}
                        onChange={(event) =>
                          updateTypedItem(selectedItem.id, "iris", (entry) => ({
                            ...entry,
                            tabLengthMm: event.target.value ? Number(event.target.value) : undefined
                          }))
                        }
                      />
                    </>
                  )}
                </>
              )}

              {selectedItem.type === "diffusion" && (
                <>
                  <NumberInput
                    label="Disk diameter (mm)"
                    value={selectedItem.diskDiameterMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "diffusion", (entry) => ({
                        ...entry,
                        diskDiameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Clear center diameter (mm)"
                    value={selectedItem.clearCenterDiameterMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "diffusion", (entry) => ({
                        ...entry,
                        clearCenterDiameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Diffusion outer diameter (mm)"
                    value={selectedItem.diffusionOuterDiameterMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "diffusion", (entry) => ({
                        ...entry,
                        diffusionOuterDiameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Thickness (mm)"
                    value={selectedItem.thicknessMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "diffusion", (entry) => ({
                        ...entry,
                        thicknessMm: Number(event.target.value)
                      }))
                    }
                  />
                </>
              )}

              {selectedItem.type === "mount" && (
                <>
                  <Select
                    label="Mount type"
                    value={selectedItem.mountType}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "mount", (entry) => ({
                        ...entry,
                        mountType: event.target.value as typeof selectedItem.mountType
                      }))
                    }
                  >
                    <option value="PL">PL</option>
                    <option value="LPL">LPL</option>
                    <option value="EF">EF</option>
                    <option value="E">E</option>
                    <option value="M42">M42</option>
                    <option value="CUSTOM">CUSTOM</option>
                  </Select>
                  <NumberInput
                    label="Flange distance (mm)"
                    value={selectedItem.flangeDistanceMm ?? ""}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "mount", (entry) => ({
                        ...entry,
                        flangeDistanceMm: event.target.value ? Number(event.target.value) : undefined
                      }))
                    }
                  />
                  <NumberInput
                    label="Inner clearance (mm)"
                    value={selectedItem.innerClearanceMm ?? ""}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "mount", (entry) => ({
                        ...entry,
                        innerClearanceMm: event.target.value ? Number(event.target.value) : undefined
                      }))
                    }
                  />
                </>
              )}

              {selectedItem.type === "barrel" && (
                <>
                  <NumberInput
                    label="Inner diameter (mm)"
                    value={selectedItem.innerDiameterMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "barrel", (entry) => ({
                        ...entry,
                        innerDiameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Outer diameter (mm)"
                    value={selectedItem.outerDiameterMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "barrel", (entry) => ({
                        ...entry,
                        outerDiameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Length (mm)"
                    value={selectedItem.lengthMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "barrel", (entry) => ({
                        ...entry,
                        lengthMm: Number(event.target.value)
                      }))
                    }
                  />
                </>
              )}

              {selectedItem.type === "retaining_ring" && (
                <>
                  <NumberInput
                    label="Inner diameter (mm)"
                    value={selectedItem.innerDiameterMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "retaining_ring", (entry) => ({
                        ...entry,
                        innerDiameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Outer diameter (mm)"
                    value={selectedItem.outerDiameterMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "retaining_ring", (entry) => ({
                        ...entry,
                        outerDiameterMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Thickness (mm)"
                    value={selectedItem.thicknessMm}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "retaining_ring", (entry) => ({
                        ...entry,
                        thicknessMm: Number(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Notch count"
                    value={selectedItem.notchCount ?? ""}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "retaining_ring", (entry) => ({
                        ...entry,
                        notchCount: event.target.value ? Number(event.target.value) : undefined
                      }))
                    }
                  />
                </>
              )}

              {selectedItem.type === "custom" && (
                <>
                  <NumberInput
                    label="Length (mm)"
                    value={selectedItem.lengthMm ?? ""}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "custom", (entry) => ({
                        ...entry,
                        lengthMm: event.target.value ? Number(event.target.value) : undefined
                      }))
                    }
                  />
                  <NumberInput
                    label="Diameter (mm)"
                    value={selectedItem.diameterMm ?? ""}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "custom", (entry) => ({
                        ...entry,
                        diameterMm: event.target.value ? Number(event.target.value) : undefined
                      }))
                    }
                  />
                </>
              )}

              <WarningBox title="Inline Validation" lines={selectedErrors} />
            </div>
          )}
          <div className="mt-4 border-t border-labBorder pt-3">
            <Button variant="primary" onClick={() => selectedItem && duplicateItem(selectedItem.id)}>
              Duplicate item
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
