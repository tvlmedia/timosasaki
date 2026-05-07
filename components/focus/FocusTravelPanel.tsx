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
  normalizeFocusTravelSetup
} from "@/lib/focusTravel";
import type { FocusTravelSetup, LensMountType, LensProject } from "@/types";

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

function buildDesignSummary(setup: FocusTravelSetup): string {
  const calc = calculateFocusTravel(setup);
  if (
    typeof calc.recommendedPrototypeTravelMm !== "number" ||
    typeof calc.targetPositionInfinityMm !== "number" ||
    typeof calc.targetPositionCloseFocusMm !== "number"
  ) {
    return "Fill infinity/close-focus donor measurements first to generate a Focus Travel design summary.";
  }

  const rearCarrierLine =
    typeof setup.targetMountThroatDiameterMm === "number" && setup.targetMountThroatDiameterMm > 0
      ? `Keep rear carrier OD below about ${(setup.targetMountThroatDiameterMm - 1).toFixed(
          2
        )}mm (target throat - 1.0mm safety margin).`
      : "Measure actual target mount throat diameter before finalizing rear carrier OD.";

  return [
    `Build the prototype optical carrier with at least ${f(calc.recommendedPrototypeTravelMm)}mm travel.`,
    `Allow ${f(
      setup.infinityOvertravelMm
    )}mm extra movement toward the sensor beyond calculated infinity and ${f(
      setup.closeFocusExtraMarginMm
    )}mm extra movement toward the front beyond close focus.`,
    `Calculated infinity position: ${signed(calc.targetPositionInfinityMm)}mm relative to target flange.`,
    `Calculated close-focus position: ${signed(calc.targetPositionCloseFocusMm)}mm relative to target flange.`,
    `Prototype range: ${signed(calc.prototypeStartMm ?? 0)}mm to ${signed(calc.prototypeEndMm ?? 0)}mm.`,
    rearCarrierLine
  ].join(" ");
}

export function FocusTravelPanel({
  project,
  onProjectChange
}: {
  project: LensProject;
  onProjectChange: (project: LensProject) => void;
}) {
  const setup = normalizeFocusTravelSetup(project.focusTravel);
  const calc = useMemo(() => calculateFocusTravel(setup), [setup]);
  const [feedback, setFeedback] = useState<string>("");

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

  const summaryText = buildDesignSummary(setup);

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
    if (typeof calc.recommendedPrototypeTravelMm !== "number" || calc.recommendedPrototypeTravelMm <= 0) {
      setFeedback("Enter valid donor measurements first to create a moving carrier preset.");
      return;
    }

    patchSetup({
      movingCarrierCadPreset: {
        travelMm: Number(calc.recommendedPrototypeTravelMm.toFixed(2)),
        rearCarrierOuterDiameterMm: setup.rearCarrierOuterDiameterMm,
        sourceSummary: summaryText,
        createdAt: new Date().toISOString()
      }
    });
    setFeedback("Moving carrier CAD preset saved.");
  };

  const combinedWarnings = [
    ...calc.warnings,
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
  ];

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
                patchSetup({
                  targetMount: mount,
                  targetFlangeDistanceMm: getDefaultFlangeForMount(mount) ?? setup.targetFlangeDistanceMm
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
          <div className="grid gap-3 md:grid-cols-2">
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
              <SummaryRow label="Actual focus travel" value={`${f(calc.actualFocusTravelMm)} mm`} />
              <SummaryRow label="Prototype carrier start" value={`${signed(calc.prototypeStartMm)} mm`} />
              <SummaryRow label="Prototype carrier end" value={`${signed(calc.prototypeEndMm)} mm`} />
              <SummaryRow
                label="Total recommended prototype travel"
                value={`${f(calc.recommendedPrototypeTravelMm)} mm`}
              />
            </div>
          ) : (
            <p className="text-sm text-labMuted">
              Enter donor infinity + close focus measurements to calculate target positions and recommended travel.
            </p>
          )}
        </>
      )}

      {sectionCard(
        "PL Throat / Rear Carrier Clearance",
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <NumberInput
              label="Target mount throat diameter (mm)"
              value={setup.targetMountThroatDiameterMm ?? ""}
              onChange={(event) =>
                patchSetup({
                  targetMountThroatDiameterMm: parsePositiveOptional(event.target.value)
                })
              }
              step="0.01"
              min="0"
            />
            <NumberInput
              label="Rear carrier outer diameter (mm)"
              value={setup.rearCarrierOuterDiameterMm ?? ""}
              onChange={(event) =>
                patchSetup({
                  rearCarrierOuterDiameterMm: parsePositiveOptional(event.target.value)
                })
              }
              step="0.01"
              min="0"
            />
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
                      left: `calc(12px + (100% - 24px) * ${toPct(calc.prototypeStartMm) / 100})`,
                      width: `calc((100% - 24px) * ${(toPct(calc.prototypeEndMm) - toPct(calc.prototypeStartMm)) / 100})`
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
