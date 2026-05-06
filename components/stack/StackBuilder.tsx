"use client";

import { useMemo, useState } from "react";
import { createId } from "@/lib/ids";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { NumberInput } from "@/components/common/NumberInput";
import { Select } from "@/components/common/Select";
import { WarningBox } from "@/components/common/WarningBox";
import { AddStackItemModal } from "@/components/stack/AddStackItemModal";
import { StackItemCard } from "@/components/stack/StackItemCard";
import { StackPreview2D } from "@/components/stack/StackPreview2D";
import { StackSummary } from "@/components/stack/StackSummary";
import type { LensProject, StackItem, StackItemType } from "@/types";

function normalizePositions(items: StackItem[]): StackItem[] {
  return items
    .slice()
    .sort((a, b) => a.positionIndex - b.positionIndex)
    .map((item, index) => ({ ...item, positionIndex: index }));
}

function createStackItem(type: StackItemType, index: number): StackItem {
  const id = createId(type);
  switch (type) {
    case "glass":
      return {
        id,
        name: "New glass",
        type,
        positionIndex: index,
        diameterMm: 30,
        thicknessMm: 4,
        flipped: false
      };
    case "spacer":
      return {
        id,
        name: "New spacer",
        type,
        positionIndex: index,
        innerDiameterMm: 26,
        outerDiameterMm: 34,
        thicknessMm: 2
      };
    case "iris":
      return {
        id,
        name: "New iris",
        type,
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
        positionIndex: index,
        lengthMm: 0
      };
  }
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
        errors.push("Spacer dimensions must be positive.");
      }
      if (item.innerDiameterMm >= item.outerDiameterMm) errors.push("Spacer inner diameter must be smaller than outer.");
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
    const newItem = createStackItem(type, orderedItems.length);
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

  return (
    <div className="space-y-4">
      <AddStackItemModal onAdd={addItem} />
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
                    label="Clear aperture (mm)"
                    value={selectedItem.clearApertureMm ?? ""}
                    min={0}
                    onChange={(event) =>
                      updateTypedItem(selectedItem.id, "glass", (entry) => ({
                        ...entry,
                        clearApertureMm: event.target.value ? Number(event.target.value) : undefined
                      }))
                    }
                  />
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
