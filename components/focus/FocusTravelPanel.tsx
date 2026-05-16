"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { NumberInput } from "@/components/common/NumberInput";
import { Select } from "@/components/common/Select";
import { WarningBox } from "@/components/common/WarningBox";
import {
  calculateFocusTravel,
  getDefaultFlangeForMount,
  getMountThroatPresetMm,
  normalizeFocusTravelSetup,
  resolveRearCarrierOuterDiameterForFocus
} from "@/lib/focusTravel";
import type {
  FocusTravelSetup,
  LensMountType,
  LensProject,
  RearCarrierOuterDiameterSource,
  TargetMountThroatDiameterSource
} from "@/types";

const mountOptions: Array<{ value: LensMountType; label: string }> = [
  { value: "M42", label: "M42" },
  { value: "EF", label: "Canon EF" },
  { value: "PL", label: "ARRI PL" },
  { value: "LPL", label: "ARRI LPL" },
  { value: "E", label: "Sony E" },
  { value: "NIKON_F", label: "Nikon F" },
  { value: "LEICA_M", label: "Leica M" },
  { value: "CUSTOM", label: "Custom" }
];

function f(value: number, digits = 2): string {
  return value.toFixed(digits);
}

function signed(value: number, digits = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function parsePositiveOptional(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function parsePositiveRequired(value: string, fallback: number): number {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-labMuted">{label}</span>
      <span className="mono text-right">{value}</span>
    </div>
  );
}

function sectionCard(title: string, body: ReactNode) {
  return (
    <section className="panel space-y-3 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-labMuted">{title}</h3>
      {body}
    </section>
  );
}

function getRearCarrierSourceLabel(source: RearCarrierOuterDiameterSource): string {
  if (source === "auto_fit_system") return "Auto-fit System carrier_outer_diameter";
  if (source === "sliding_carrier_part") return "Sliding optical carrier CAD part";
  if (source === "manual") return "Manual override";
  return "Unknown";
}

function getTargetMountThroatSourceLabel(source: TargetMountThroatDiameterSource): string {
  if (source === "manual") return "Manual";
  if (source === "mount_preset") return "Mount preset";
  return "Unknown";
}

function buildDesignSummary({
  setup,
  rearCarrierOuterDiameterMm,
  rearCarrierSourceLabel,
  targetMountThroatDiameterMm,
  clearanceMm
}: {
  setup: FocusTravelSetup;
  rearCarrierOuterDiameterMm?: number;
  rearCarrierSourceLabel: string;
  targetMountThroatDiameterMm?: number;
  clearanceMm?: number;
}): string {
  const calc = calculateFocusTravel(setup);
  if (
    typeof calc.actualFocusTravelMm !== "number" ||
    typeof calc.recommendedPrototypeTravelMm !== "number" ||
    typeof setup.donorFlangeToReferenceInfinityMm !== "number" ||
    typeof setup.donorFlangeToReferenceCloseFocusMm !== "number"
  ) {
    return "Fill infinity/close-focus donor measurements first to generate a Focus Travel design summary.";
  }

  const parts = [
    `Measured focus travel is ${f(calc.actualFocusTravelMm)}mm based on infinity ${f(
      setup.donorFlangeToReferenceInfinityMm
    )}mm and close focus ${f(setup.donorFlangeToReferenceCloseFocusMm)}mm.`,
    `With ${f(setup.infinityOvertravelMm)}mm infinity overtravel and ${f(
      setup.closeFocusExtraMarginMm
    )}mm close focus margin, recommended prototype travel is ${f(calc.recommendedPrototypeTravelMm)}mm${
      typeof calc.recommendedSlotLengthMm === "number"
        ? ` and recommended slot length is ${f(calc.recommendedSlotLengthMm)}mm`
        : ""
    }.`,
    typeof rearCarrierOuterDiameterMm === "number"
      ? `Rear carrier OD is ${f(rearCarrierOuterDiameterMm)}mm from ${rearCarrierSourceLabel}.`
      : "Rear carrier OD is unavailable. Generate/update auto-fit sizing first or enable manual override.",
    typeof targetMountThroatDiameterMm === "number"
      ? `Target mount throat is ${f(targetMountThroatDiameterMm)}mm; rear carrier clearance is ${f(
          clearanceMm ?? 0
        )}mm.`
      : "Measure actual PL throat diameter before finalizing rear carrier clearance."
  ];
  if (targetMountThroatDiameterMm !== undefined) {
    parts.push("Measure actual PL throat diameter before finalizing rear carrier clearance.");
  }
  return parts.join(" ");
}

export function FocusTravelPanel({
  project,
  onProjectChange
}: {
  project: LensProject;
  onProjectChange: (project: LensProject) => void;
}) {
  const setup = normalizeFocusTravelSetup(project.focusTravel);
  const [feedback, setFeedback] = useState<string>("");

  const rearCarrierResolution = useMemo(
    () => resolveRearCarrierOuterDiameterForFocus(project, setup),
    [project, setup]
  );
  const resolvedRearCarrierOuterDiameterMm = rearCarrierResolution.valueMm;

  const projectTargetMountThroatDiameterMm =
    typeof setup.targetMountThroatDiameterMm === "number" && setup.targetMountThroatDiameterMm > 0
      ? setup.targetMountThroatDiameterMm
      : undefined;
  const mountPresetThroatMm = getMountThroatPresetMm(setup.targetMount);
  const resolvedTargetMountThroatDiameterMm =
    projectTargetMountThroatDiameterMm ?? mountPresetThroatMm;
  const resolvedTargetMountThroatSource: TargetMountThroatDiameterSource =
    projectTargetMountThroatDiameterMm !== undefined
      ? setup.targetMountThroatDiameterSource === "mount_preset" ||
        setup.targetMountThroatDiameterSource === "manual"
        ? setup.targetMountThroatDiameterSource
        : "manual"
      : mountPresetThroatMm !== undefined
        ? "mount_preset"
        : "unknown";

  const effectiveSetup = useMemo(
    () =>
      normalizeFocusTravelSetup({
        ...setup,
        rearCarrierOuterDiameterMm: resolvedRearCarrierOuterDiameterMm,
        rearCarrierOuterDiameterSource: rearCarrierResolution.source,
        targetMountThroatDiameterMm: resolvedTargetMountThroatDiameterMm,
        targetMountThroatDiameterSource: resolvedTargetMountThroatSource
      }),
    [
      setup,
      resolvedRearCarrierOuterDiameterMm,
      rearCarrierResolution.source,
      resolvedTargetMountThroatDiameterMm,
      resolvedTargetMountThroatSource
    ]
  );
  const calc = useMemo(() => calculateFocusTravel(effectiveSetup), [effectiveSetup]);

  const rearCarrierToThroatClearanceMm =
    typeof resolvedTargetMountThroatDiameterMm === "number" &&
    typeof resolvedRearCarrierOuterDiameterMm === "number"
      ? Number((resolvedTargetMountThroatDiameterMm - resolvedRearCarrierOuterDiameterMm).toFixed(3))
      : undefined;

  const patchSetup = (patch: Partial<FocusTravelSetup>) => {
    const nextSetup = normalizeFocusTravelSetup({ ...setup, ...patch });
    onProjectChange({
      ...project,
      focusTravel: nextSetup
    });
  };

  const mountOffsetMeaning =
    calc.targetOffsetMm > 0
      ? "The original flange reference is behind the target flange, toward the sensor."
      : calc.targetOffsetMm < 0
        ? "The original flange reference is in front of the target flange, away from the sensor."
        : "Original and target flange distances match (no offset).";

  const summaryText = buildDesignSummary({
    setup: effectiveSetup,
    rearCarrierOuterDiameterMm: resolvedRearCarrierOuterDiameterMm,
    rearCarrierSourceLabel: getRearCarrierSourceLabel(rearCarrierResolution.source),
    targetMountThroatDiameterMm: resolvedTargetMountThroatDiameterMm,
    clearanceMm: rearCarrierToThroatClearanceMm
  });

  const diagramValues =
    typeof calc.prototypeStartMm === "number" &&
    typeof calc.prototypeEndMm === "number" &&
    typeof calc.targetPositionInfinityMm === "number" &&
    typeof calc.targetPositionCloseFocusMm === "number"
      ? [calc.prototypeStartMm, calc.prototypeEndMm, calc.targetPositionInfinityMm, calc.targetPositionCloseFocusMm, 0]
      : undefined;

  const dMin = diagramValues ? Math.min(...diagramValues) : -10;
  const dMax = diagramValues ? Math.max(...diagramValues) : 20;
  const dSpan = Math.max(1, dMax - dMin);
  const toPct = (value: number) => ((value - dMin) / dSpan) * 100;

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      setFeedback("Summary copied.");
    } catch {
      setFeedback("Could not copy summary from this browser context.");
    }
  };

  const saveSummaryToNotes = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const block = `[Focus Travel ${stamp}]\n${summaryText}`;
    const existing = project.notes?.trim() ?? "";
    const notes = existing ? `${existing}\n\n${block}` : block;
    onProjectChange({
      ...project,
      notes
    });
    setFeedback("Summary saved to project notes.");
  };

  const createMovingCarrierPreset = () => {
    if (
      typeof calc.actualFocusTravelMm !== "number" ||
      typeof calc.recommendedPrototypeTravelMm !== "number" ||
      calc.recommendedPrototypeTravelMm <= 0
    ) {
      setFeedback("Enter valid donor measurements first to create a moving carrier preset.");
      return;
    }

    const nextFocusTravel = normalizeFocusTravelSetup({
      ...setup,
      actualFocusTravelMm: Number(calc.actualFocusTravelMm.toFixed(2)),
      recommendedPrototypeTravelMm: Number(calc.recommendedPrototypeTravelMm.toFixed(2)),
      recommendedSlotLengthMm:
        typeof calc.recommendedSlotLengthMm === "number"
          ? Number(calc.recommendedSlotLengthMm.toFixed(2))
          : undefined,
      movingCarrierCadPreset: {
        travelMm: Number(calc.recommendedPrototypeTravelMm.toFixed(2)),
        actualFocusTravelMm: Number(calc.actualFocusTravelMm.toFixed(2)),
        recommendedSlotLengthMm:
          typeof calc.recommendedSlotLengthMm === "number"
            ? Number(calc.recommendedSlotLengthMm.toFixed(2))
            : undefined,
        slotMechanicalClearanceMm: Number((effectiveSetup.slotMechanicalClearanceMm ?? 0).toFixed(2)),
        rearCarrierOuterDiameterMm: resolvedRearCarrierOuterDiameterMm,
        rearCarrierOuterDiameterSource: rearCarrierResolution.source,
        sourceSummary: summaryText,
        createdAt: new Date().toISOString()
      }
    });
    onProjectChange({
      ...project,
      focusTravel: nextFocusTravel,
      cadDefaults: {
        ...project.cadDefaults,
        plSlotLengthManualMm:
          typeof calc.recommendedSlotLengthMm === "number"
            ? Number(calc.recommendedSlotLengthMm.toFixed(2))
            : project.cadDefaults.plSlotLengthManualMm
      }
    });
    setFeedback("Moving carrier CAD preset saved.");
  };

  const clearanceWarnings = (() => {
    const warnings: string[] = [];
    if (resolvedTargetMountThroatDiameterMm === undefined) {
      warnings.push("Measure actual PL throat diameter before finalizing rear carrier size.");
    } else if (
      resolvedTargetMountThroatSource === "mount_preset" &&
      projectTargetMountThroatDiameterMm === undefined
    ) {
      warnings.push("Mount throat value is currently a preset. Measure your actual PL throat opening before finalizing.");
    }
    if (resolvedRearCarrierOuterDiameterMm === undefined) {
      warnings.push("Rear carrier OD unavailable. Generate/update auto-fit sizing first or enter manual override.");
    }
    if (typeof rearCarrierToThroatClearanceMm === "number") {
      if (rearCarrierToThroatClearanceMm < 0) {
        warnings.push("Rear carrier is larger than the PL throat and will collide.");
      } else if (rearCarrierToThroatClearanceMm < 1.0) {
        warnings.push("Rear carrier clearance is very tight. Increase clearance or reduce rear carrier OD.");
      } else if (rearCarrierToThroatClearanceMm < 2.0) {
        warnings.push("Rear carrier clearance is small. Check print tolerances and PL mount geometry.");
      }
    }
    return warnings;
  })();

  const combinedWarnings = Array.from(new Set([
    ...calc.warnings,
    ...clearanceWarnings,
    ...(
      setup.originalFlangeDistanceMm <= 0 ||
      setup.targetFlangeDistanceMm <= 0
        ? ["Flange distances must be positive."]
        : []
    ),
    ...(
      setup.infinityOvertravelMm < 0 || setup.closeFocusExtraMarginMm < 0
        ? ["Infinity overtravel and close focus margin must be >= 0."]
        : []
    )
  ]));

  const clearanceStatusLine =
    typeof rearCarrierToThroatClearanceMm !== "number"
      ? "Clearance cannot be calculated until target mount throat diameter is known."
      : rearCarrierToThroatClearanceMm < 0
        ? "Rear carrier is larger than the PL throat and will collide."
        : rearCarrierToThroatClearanceMm < 1.0
          ? "Rear carrier clearance is very tight. Increase clearance or reduce rear carrier OD."
          : rearCarrierToThroatClearanceMm < 2.0
            ? "Rear carrier clearance is small. Check print tolerances and PL mount geometry."
            : "Rear carrier clears PL throat.";

  return (
    <div className="space-y-4">
      <div className="panel p-4 text-sm text-labMuted">
        Measure the original donor lens at infinity and close focus from the original mount flange plane to the same
        optical reference point. The app converts those positions to the target mount flange plane and adds prototype
        travel margins.
      </div>

      {sectionCard(
        "Mount Conversion",
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Select
              label="Original mount"
              value={setup.originalMount}
              onChange={(event) => {
                const mount = event.target.value as LensMountType;
                patchSetup({
                  originalMount: mount,
                  originalFlangeDistanceMm:
                    getDefaultFlangeForMount(mount) ?? setup.originalFlangeDistanceMm
                });
              }}
            >
              {mountOptions.map((mount) => (
                <option key={mount.value} value={mount.value}>
                  {mount.label}
                </option>
              ))}
            </Select>
            <NumberInput
              label="Original flange distance (mm)"
              value={setup.originalFlangeDistanceMm}
              onChange={(event) =>
                patchSetup({
                  originalFlangeDistanceMm: parsePositiveRequired(event.target.value, setup.originalFlangeDistanceMm)
                })
              }
              step="0.01"
              min="0"
            />
            <Select
              label="Target mount"
              value={setup.targetMount}
              onChange={(event) => {
                const mount = event.target.value as LensMountType;
                const preset = getMountThroatPresetMm(mount);
                const preserveManual = setup.targetMountThroatDiameterSource === "manual";
                patchSetup({
                  targetMount: mount,
                  targetFlangeDistanceMm: getDefaultFlangeForMount(mount) ?? setup.targetFlangeDistanceMm,
                  ...(preserveManual
                    ? {}
                    : {
                        targetMountThroatDiameterMm: preset,
                        targetMountThroatDiameterSource: preset ? "mount_preset" : "unknown"
                      })
                });
              }}
            >
              {mountOptions.map((mount) => (
                <option key={mount.value} value={mount.value}>
                  {mount.label}
                </option>
              ))}
            </Select>
            <NumberInput
              label="Target flange distance (mm)"
              value={setup.targetFlangeDistanceMm}
              onChange={(event) =>
                patchSetup({
                  targetFlangeDistanceMm: parsePositiveRequired(event.target.value, setup.targetFlangeDistanceMm)
                })
              }
              step="0.01"
              min="0"
            />
          </div>

          <div className="rounded-xl border border-labBorder bg-[#0a0a0a] p-3 text-sm">
            <p className="mono">
              {setup.originalMount} → {setup.targetMount} offset: {f(setup.targetFlangeDistanceMm)} -{" "}
              {f(setup.originalFlangeDistanceMm)} = {f(calc.targetOffsetMm)}mm
            </p>
            <p className="mt-2 text-labMuted">
              Meaning: the original {setup.originalMount} flange reference plane sits {f(Math.abs(calc.targetOffsetMm))}
              mm {calc.targetOffsetMm >= 0 ? "behind" : "in front of"} the {setup.targetMount} flange plane.
            </p>
            <p className="mt-1 text-labMuted">{mountOffsetMeaning}</p>
          </div>
        </>
      )}

      {sectionCard(
        "Donor Lens Measurements",
        <>
          <Input
            label="Reference point label"
            placeholder="Back of rear group"
            value={setup.referencePointLabel}
            onChange={(event) => patchSetup({ referencePointLabel: event.target.value })}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <NumberInput
              label="Donor flange → reference @ infinity (mm)"
              value={setup.donorFlangeToReferenceInfinityMm ?? ""}
              onChange={(event) =>
                patchSetup({
                  donorFlangeToReferenceInfinityMm: parsePositiveOptional(event.target.value)
                })
              }
              step="0.01"
              min="0"
            />
            <NumberInput
              label="Donor flange → reference @ close focus (mm)"
              value={setup.donorFlangeToReferenceCloseFocusMm ?? ""}
              onChange={(event) =>
                patchSetup({
                  donorFlangeToReferenceCloseFocusMm: parsePositiveOptional(event.target.value)
                })
              }
              step="0.01"
              min="0"
            />
          </div>
          <p className="text-sm text-labMuted">
            Set the donor lens to infinity. Measure from the original mount flange plane to the chosen reference
            point. Then set the lens to close focus and measure the exact same point again.
          </p>
        </>
      )}

      {sectionCard(
        "Prototype Travel Margins",
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <NumberInput
              label="Infinity overtravel (mm)"
              value={setup.infinityOvertravelMm}
              onChange={(event) =>
                patchSetup({
                  infinityOvertravelMm: Math.max(0, Number(event.target.value || 0))
                })
              }
              step="0.1"
              min="0"
            />
            <NumberInput
              label="Close focus extra margin (mm)"
              value={setup.closeFocusExtraMarginMm}
              onChange={(event) =>
                patchSetup({
                  closeFocusExtraMarginMm: Math.max(0, Number(event.target.value || 0))
                })
              }
              step="0.1"
              min="0"
            />
            <NumberInput
              label="Slot mechanical clearance (mm)"
              value={setup.slotMechanicalClearanceMm ?? 0}
              onChange={(event) =>
                patchSetup({
                  slotMechanicalClearanceMm: Math.max(0, Number(event.target.value || 0))
                })
              }
              step="0.1"
              min="0"
            />
          </div>
          <p className="text-sm text-labMuted">
            For prototype rigs, use generous travel. The optical carrier should be able to move past calculated
            infinity to avoid issues from print tolerances, measurement error and mount shimming.
          </p>
          <div className="rounded-xl border border-labBorder bg-[#0a0a0a] p-3 text-sm text-labMuted">
            <p>Toward sensor = beyond infinity</p>
            <p>Away from sensor = closer focus</p>
          </div>
        </>
      )}

      {sectionCard(
        "Calculated Target Positions",
        <>
          <p className="text-sm text-labMuted">
            Sign convention: Positive = in front of target mount flange (away from sensor). Negative = behind target
            mount flange (toward sensor).
          </p>
          {typeof calc.targetPositionInfinityMm === "number" &&
          typeof calc.targetPositionCloseFocusMm === "number" &&
          typeof calc.actualFocusTravelMm === "number" &&
          typeof calc.prototypeStartMm === "number" &&
          typeof calc.prototypeEndMm === "number" &&
          typeof calc.recommendedPrototypeTravelMm === "number" ? (
            <div className="grid gap-2 text-sm">
              <SummaryRow
                label="Reference @ infinity relative to target flange"
                value={`${signed(calc.targetPositionInfinityMm)} mm`}
              />
              <SummaryRow
                label="Reference @ close focus relative to target flange"
                value={`${signed(calc.targetPositionCloseFocusMm)} mm`}
              />
              <SummaryRow label="Actual focus travel (|infinity - close|)" value={`${f(calc.actualFocusTravelMm)} mm`} />
              <SummaryRow label="Infinity overtravel" value={`${f(setup.infinityOvertravelMm)} mm`} />
              <SummaryRow label="Close focus extra margin" value={`${f(setup.closeFocusExtraMarginMm)} mm`} />
              <SummaryRow
                label="Total recommended prototype travel"
                value={`${f(calc.recommendedPrototypeTravelMm)} mm`}
              />
              <SummaryRow
                label="Recommended slot length"
                value={
                  typeof calc.recommendedSlotLengthMm === "number"
                    ? `${f(calc.recommendedSlotLengthMm)} mm`
                    : "N/A"
                }
              />
              <SummaryRow label="Prototype carrier start" value={`${signed(calc.prototypeStartMm)} mm`} />
              <SummaryRow label="Prototype carrier end" value={`${signed(calc.prototypeEndMm)} mm`} />
            </div>
          ) : (
            <p className="text-sm text-labMuted">
              Enter donor infinity + close focus measurements to calculate target positions and recommended travel.
            </p>
          )}
          {calc.directionHint && <p className="text-sm text-labMuted">{calc.directionHint}</p>}
        </>
      )}

      {sectionCard(
        "PL Throat / Rear Carrier Clearance",
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <NumberInput
              label="Target mount throat diameter (mm)"
              value={projectTargetMountThroatDiameterMm ?? ""}
              placeholder={mountPresetThroatMm ? `${f(mountPresetThroatMm)} (preset)` : ""}
              onChange={(event) => {
                const next = parsePositiveOptional(event.target.value);
                patchSetup({
                  targetMountThroatDiameterMm: next,
                  targetMountThroatDiameterSource: next ? "manual" : "unknown"
                });
              }}
              step="0.01"
              min="0"
            />
            <NumberInput
              label="Rear carrier outer diameter (mm)"
              value={
                setup.rearCarrierOuterDiameterManualOverride
                  ? setup.rearCarrierOuterDiameterMm ?? ""
                  : resolvedRearCarrierOuterDiameterMm ?? ""
              }
              onChange={(event) =>
                patchSetup({
                  rearCarrierOuterDiameterMm: parsePositiveOptional(event.target.value),
                  rearCarrierOuterDiameterSource: "manual"
                })
              }
              step="0.01"
              min="0"
              disabled={!setup.rearCarrierOuterDiameterManualOverride}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-labMuted">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={setup.rearCarrierOuterDiameterManualOverride ?? false}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  patchSetup({
                    rearCarrierOuterDiameterManualOverride: enabled,
                    rearCarrierOuterDiameterMm:
                      enabled
                        ? setup.rearCarrierOuterDiameterMm ?? resolvedRearCarrierOuterDiameterMm
                        : setup.rearCarrierOuterDiameterMm,
                    rearCarrierOuterDiameterSource: enabled ? "manual" : rearCarrierResolution.source
                  });
                }}
              />
              <span>Override rear carrier OD manually</span>
            </label>
          </div>

          <div className="rounded-xl border border-labBorder bg-[#0a0a0a] p-3 text-sm text-labMuted">
            <p>
              Rear carrier outer diameter:{" "}
              <span className="mono">
                {typeof resolvedRearCarrierOuterDiameterMm === "number"
                  ? `${f(resolvedRearCarrierOuterDiameterMm)} mm`
                  : "N/A"}
              </span>
            </p>
            <p>
              Source:{" "}
              <span className="mono">
                {getRearCarrierSourceLabel(
                  setup.rearCarrierOuterDiameterManualOverride ? "manual" : rearCarrierResolution.source
                )}
              </span>
            </p>
            <p className="mt-2">
              Target mount throat:{" "}
              <span className="mono">
                {typeof resolvedTargetMountThroatDiameterMm === "number"
                  ? `${f(resolvedTargetMountThroatDiameterMm)} mm`
                  : "N/A"}
              </span>
            </p>
            <p>
              Source: <span className="mono">{getTargetMountThroatSourceLabel(resolvedTargetMountThroatSource)}</span>
            </p>
            <p className="mt-2">
              Clearance:{" "}
              <span className="mono">
                {typeof rearCarrierToThroatClearanceMm === "number"
                  ? `${f(rearCarrierToThroatClearanceMm)} mm`
                  : "Clearance cannot be calculated until target mount throat diameter is known."}
              </span>
            </p>
            <p className="mt-1">{clearanceStatusLine}</p>
            <p className="mt-2 text-xs">
              Measure the smallest clear opening of your actual PL mount/reference before finalizing the rear carrier
              size.
            </p>
          </div>

          {typeof calc.recommendedMaxRearCarrierODMm === "number" && (
            <p className="text-sm text-labMuted">
              Recommended max rear carrier OD: {f(calc.recommendedMaxRearCarrierODMm)} mm
            </p>
          )}
        </>
      )}

      {combinedWarnings.length > 0 && <WarningBox title="Focus Travel Warnings" lines={combinedWarnings} />}

      {sectionCard(
        "Design Recommendation Summary",
        <>
          <textarea
            className="min-h-28 w-full rounded-xl border border-labBorder bg-[#090909] px-3 py-2 text-sm text-labText outline-none"
            value={summaryText}
            readOnly
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={copySummary}>
              Copy Summary
            </Button>
            <Button onClick={saveSummaryToNotes}>Save to Project Notes</Button>
            <Button onClick={createMovingCarrierPreset}>Create Moving Carrier CAD Preset</Button>
          </div>
          {feedback && <p className="text-xs text-labAccent">{feedback}</p>}
        </>
      )}

      {sectionCard(
        "Travel Diagram",
        <>
          <p className="text-xs text-labMuted">SENSOR side ← [behind target flange] | TARGET FLANGE | [front of lens] →</p>
          <div className="relative mt-2 h-28 rounded-xl border border-labBorder bg-[#090909]">
            <div className="absolute left-3 right-3 top-1/2 h-px -translate-y-1/2 bg-labBorder" />
            <div
              className="absolute top-3 bottom-3 w-px bg-labText"
              style={{ left: `calc(12px + (100% - 24px) * ${toPct(0) / 100})` }}
            />
            {typeof calc.prototypeStartMm === "number" &&
              typeof calc.prototypeEndMm === "number" &&
              typeof calc.targetPositionInfinityMm === "number" &&
              typeof calc.targetPositionCloseFocusMm === "number" && (
                <>
                  <div
                    className="absolute top-[54%] h-3 -translate-y-1/2 rounded bg-labAccent/30"
                    style={{
                      left: `calc(12px + (100% - 24px) * ${Math.min(toPct(calc.prototypeStartMm), toPct(calc.prototypeEndMm)) / 100})`,
                      width: `calc((100% - 24px) * ${Math.abs(toPct(calc.prototypeEndMm) - toPct(calc.prototypeStartMm)) / 100})`
                    }}
                  />
                  <div
                    className="absolute top-[22%] bottom-[22%] w-px border-l border-dashed border-labAccent/70"
                    style={{ left: `calc(12px + (100% - 24px) * ${toPct(calc.prototypeStartMm) / 100})` }}
                  />
                  <div
                    className="absolute top-[22%] bottom-[22%] w-px border-l border-dashed border-labAccent/70"
                    style={{ left: `calc(12px + (100% - 24px) * ${toPct(calc.prototypeEndMm) / 100})` }}
                  />
                  <div
                    className="absolute top-[20%] bottom-[20%] w-[2px] bg-[#37a3ff]"
                    style={{ left: `calc(12px + (100% - 24px) * ${toPct(calc.targetPositionInfinityMm) / 100})` }}
                  />
                  <div
                    className="absolute top-[20%] bottom-[20%] w-[2px] bg-[#4ade80]"
                    style={{ left: `calc(12px + (100% - 24px) * ${toPct(calc.targetPositionCloseFocusMm) / 100})` }}
                  />
                  <div className="absolute bottom-2 left-3 right-3 flex justify-between text-[10px] text-labMuted">
                    <span>Start {signed(calc.prototypeStartMm)}mm</span>
                    <span>Inf {signed(calc.targetPositionInfinityMm)}mm</span>
                    <span>Close {signed(calc.targetPositionCloseFocusMm)}mm</span>
                    <span>End {signed(calc.prototypeEndMm)}mm</span>
                  </div>
                </>
              )}
          </div>
        </>
      )}

      {sectionCard(
        "Reference Notes",
        <>
          <div className="space-y-2 text-sm text-labMuted">
            <p>
              <strong className="text-labText">Original flange reference:</strong> The plane on the original donor
              lens mount that sits against the camera/adapter.
            </p>
            <p>
              <strong className="text-labText">Target flange reference:</strong> The plane on the new mount, for
              example the front PL flange face.
            </p>
            <p>
              <strong className="text-labText">Target offset:</strong> The distance between target mount flange
              distance and original mount flange distance.
            </p>
            <p>
              <strong className="text-labText">Overtravel:</strong> Extra movement beyond calculated infinity so the
              lens can focus past infinity during testing.
            </p>
          </div>
        </>
      )}

      <div className="panel p-3 text-xs text-labWarning">
        Approximate photo/measurement conversion for prototype rehousing only. Final infinity should be found
        physically on an adjustable test rig with real camera checks.
      </div>
    </div>
  );
}
