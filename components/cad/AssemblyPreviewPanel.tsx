"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/common/Button";
import {
  ThreeAssemblyPreview,
  type ThreeAssemblyDisplayOptions
} from "@/components/cad/ThreeAssemblyPreview";
import {
  getAssemblyPreviewData,
  type AssemblyPreviewCheck,
  type AssemblyPreviewColorRole,
  type AssemblyPreviewPart
} from "@/lib/assemblyPreview";
import type { LensProject } from "@/types";

type AssemblyMode = "assembled" | "exploded";
type PreviewViewMode = "side_2d" | "interactive_3d";

type DisplayPart = AssemblyPreviewPart & {
  displayStartMm: number;
  displayEndMm: number;
  displayIndex: number;
};

type RoleStyle = {
  fill: string;
  stroke: string;
  text: string;
  top: string;
  side: string;
};

const ROLE_STYLE: Record<AssemblyPreviewColorRole, RoleStyle> = {
  cup: {
    fill: "rgba(245, 194, 66, 0.36)",
    stroke: "#f4c556",
    text: "#ffe6a3",
    top: "rgba(255, 213, 106, 0.48)",
    side: "rgba(198, 152, 47, 0.46)"
  },
  spacer: {
    fill: "rgba(220, 227, 235, 0.26)",
    stroke: "#d4dbe2",
    text: "#eaf0f5",
    top: "rgba(236, 242, 247, 0.36)",
    side: "rgba(168, 178, 188, 0.4)"
  },
  insert: {
    fill: "rgba(255, 154, 66, 0.38)",
    stroke: "#ff9f58",
    text: "#ffd5b1",
    top: "rgba(255, 180, 114, 0.5)",
    side: "rgba(214, 115, 41, 0.46)"
  },
  carrier: {
    fill: "rgba(72, 186, 120, 0.14)",
    stroke: "#6dd09a",
    text: "#96e6bc",
    top: "rgba(91, 201, 136, 0.22)",
    side: "rgba(45, 131, 84, 0.24)"
  },
  barrel: {
    fill: "rgba(84, 176, 212, 0.13)",
    stroke: "#63b8d8",
    text: "#9edbf0",
    top: "rgba(106, 192, 224, 0.2)",
    side: "rgba(55, 124, 149, 0.24)"
  },
  ring: {
    fill: "rgba(182, 192, 201, 0.24)",
    stroke: "#b8c4cf",
    text: "#d8e0e7",
    top: "rgba(204, 214, 223, 0.33)",
    side: "rgba(138, 149, 160, 0.36)"
  },
  custom: {
    fill: "rgba(156, 169, 187, 0.22)",
    stroke: "#b7c2d4",
    text: "#d8e0ed",
    top: "rgba(183, 194, 214, 0.3)",
    side: "rgba(124, 137, 156, 0.34)"
  }
};

const LEGEND_ITEMS: Array<{ label: string; role: AssemblyPreviewColorRole }> = [
  { label: "Cup", role: "cup" },
  { label: "Spacer", role: "spacer" },
  { label: "Insert / Iris", role: "insert" },
  { label: "Carrier", role: "carrier" },
  { label: "Fixed Barrel", role: "barrel" }
];

const CHECK_STATUS_ORDER: Record<AssemblyPreviewCheck["status"], number> = {
  error: 0,
  warning: 1,
  ok: 2
};

function prettyMm(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toFixed(3);
}

function checkStatusIcon(status: AssemblyPreviewCheck["status"]): string {
  if (status === "error") return "✖";
  if (status === "warning") return "⚠";
  return "✓";
}

function checkStatusClass(status: AssemblyPreviewCheck["status"]): string {
  if (status === "error") return "text-labDanger";
  if (status === "warning") return "text-labWarning";
  return "text-[#80db9f]";
}

function partTooltipText(part: DisplayPart): string {
  return [
    part.label,
    `Type: ${part.type}`,
    `Length: ${part.lengthMm.toFixed(3)} mm`,
    `OD: ${part.outerDiameterMm.toFixed(3)} mm`,
    part.innerDiameterMm ? `ID: ${part.innerDiameterMm.toFixed(3)} mm` : undefined,
    part.apertureDiameterMm ? `Aperture: ${part.apertureDiameterMm.toFixed(3)} mm` : undefined,
    `Start Z: ${part.startZMm.toFixed(3)} mm`,
    `End Z: ${part.endZMm.toFixed(3)} mm`,
    part.notes ? `Notes: ${part.notes}` : undefined
  ]
    .filter(Boolean)
    .join("\n");
}

function overlayTooltipText(label: string, lengthMm: number, outerMm: number, innerMm: number): string {
  return [
    label,
    `Length: ${lengthMm.toFixed(3)} mm`,
    `OD: ${outerMm.toFixed(3)} mm`,
    `ID: ${innerMm.toFixed(3)} mm`
  ].join("\n");
}

export function AssemblyPreviewPanel({ project }: { project: LensProject }) {
  const [assemblyMode, setAssemblyMode] = useState<AssemblyMode>("assembled");
  const [viewMode, setViewMode] = useState<PreviewViewMode>("side_2d");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [threeAvailability, setThreeAvailability] = useState<"unknown" | "ready" | "unavailable">("unknown");
  const [threeResetSignal, setThreeResetSignal] = useState(0);
  const [threeDisplay, setThreeDisplay] = useState<ThreeAssemblyDisplayOptions>({
    showFixedBarrel: true,
    showCarrier: true,
    showCupsAndSpacers: true,
    showInserts: true,
    xRayMode: true
  });

  const preview = useMemo(() => getAssemblyPreviewData(project), [project]);

  const explodedGapMm = 6.0;
  const sequenceWithDisplay = useMemo<DisplayPart[]>(() => {
    return preview.sequence.map((part, index) => {
      const explodedOffset = assemblyMode === "exploded" ? index * explodedGapMm : 0;
      const displayStartMm = Number((part.startZMm + explodedOffset).toFixed(3));
      const displayEndMm = Number((displayStartMm + part.lengthMm).toFixed(3));
      return {
        ...part,
        displayStartMm,
        displayEndMm,
        displayIndex: index
      };
    });
  }, [preview.sequence, assemblyMode]);

  const checksSorted = useMemo(() => {
    return [...preview.checks].sort((a, b) => {
      const statusDelta = CHECK_STATUS_ORDER[a.status] - CHECK_STATUS_ORDER[b.status];
      if (statusDelta !== 0) return statusDelta;
      return a.label.localeCompare(b.label);
    });
  }, [preview.checks]);

  const maxOuterDiameterMm = useMemo(() => {
    const partMax = sequenceWithDisplay.reduce((max, part) => Math.max(max, part.outerDiameterMm), 0);
    return Math.max(
      partMax,
      preview.derived.targetStackOuterDiameterMm,
      preview.derived.carrierOuterDiameterMm,
      preview.derived.fixedBarrelOuterDiameterMm,
      10
    );
  }, [sequenceWithDisplay, preview.derived]);

  const displayStackStartMm = sequenceWithDisplay.length ? sequenceWithDisplay[0].displayStartMm : 0;
  const displayStackEndMm = sequenceWithDisplay.length
    ? sequenceWithDisplay[sequenceWithDisplay.length - 1].displayEndMm
    : 0;
  const displayStackLengthMm = Number(Math.max(0, displayStackEndMm - displayStackStartMm).toFixed(3));

  const marginLeftPx = 78;
  const marginRightPx = 120;
  const canvasHeightPx = 470;
  const centerYPx = 236;
  const maxOuterHeightPx = 250;
  const baseViewportWidthPx = 1040;

  const pxPerMmX =
    displayStackLengthMm > 0
      ? Math.max(3.5, Math.min(14, (baseViewportWidthPx - marginLeftPx - marginRightPx) / Math.max(displayStackLengthMm, 40)))
      : 8;
  const canvasWidthPx = Math.max(
    baseViewportWidthPx,
    Math.round(displayStackLengthMm * pxPerMmX + marginLeftPx + marginRightPx)
  );
  const diameterScale = maxOuterHeightPx / maxOuterDiameterMm;
  const mmToX = (valueMm: number) => marginLeftPx + (valueMm - displayStackStartMm) * pxPerMmX;

  const carrierVisualLengthMm = Math.max(preview.derived.carrierLengthMm, displayStackLengthMm);
  const barrelVisualLengthMm = Math.max(preview.derived.fixedBarrelLengthMm, displayStackLengthMm);

  const selectedPart = useMemo(() => {
    return sequenceWithDisplay.find((part) => part.id === selectedId);
  }, [sequenceWithDisplay, selectedId]);

  const selectedInfo = useMemo(() => {
    if (selectedPart) {
      return {
        title: selectedPart.label,
        body: `Type ${selectedPart.type} · Z ${selectedPart.startZMm.toFixed(3)} → ${selectedPart.endZMm.toFixed(3)} mm · L ${selectedPart.lengthMm.toFixed(3)} mm · OD ${selectedPart.outerDiameterMm.toFixed(3)} mm`
      };
    }
    if (selectedId === "__carrier") {
      return {
        title: "Sliding optical carrier",
        body: `L ${preview.derived.carrierLengthMm.toFixed(3)} mm · ID ${preview.derived.carrierInnerDiameterMm.toFixed(3)} mm · OD ${preview.derived.carrierOuterDiameterMm.toFixed(3)} mm`
      };
    }
    if (selectedId === "__fixed_barrel") {
      return {
        title: "Fixed PL barrel",
        body: `L ${preview.derived.fixedBarrelLengthMm.toFixed(3)} mm · ID ${preview.derived.fixedBarrelInnerDiameterMm.toFixed(3)} mm · OD ${preview.derived.fixedBarrelOuterDiameterMm.toFixed(3)} mm`
      };
    }
    return null;
  }, [selectedPart, selectedId, preview.derived]);

  const show3dFallback = viewMode === "interactive_3d" && threeAvailability === "unavailable";

  const renderSide2D = () => {
    const barrelStyle = ROLE_STYLE.barrel;
    const carrierStyle = ROLE_STYLE.carrier;

    const barrelHeightPx = Math.max(14, preview.derived.fixedBarrelOuterDiameterMm * diameterScale);
    const barrelInnerHeightPx = Math.max(
      6,
      Math.min(barrelHeightPx - 4, preview.derived.fixedBarrelInnerDiameterMm * diameterScale)
    );
    const barrelX = mmToX(displayStackStartMm);
    const barrelWidthPx = barrelVisualLengthMm * pxPerMmX;

    const carrierHeightPx = Math.max(12, preview.derived.carrierOuterDiameterMm * diameterScale);
    const carrierInnerHeightPx = Math.max(
      6,
      Math.min(carrierHeightPx - 4, preview.derived.carrierInnerDiameterMm * diameterScale)
    );
    const carrierX = mmToX(displayStackStartMm);
    const carrierWidthPx = carrierVisualLengthMm * pxPerMmX;

    return (
      <svg width={canvasWidthPx} height={canvasHeightPx} className="block">
        <line
          x1={marginLeftPx - 36}
          y1={centerYPx}
          x2={canvasWidthPx - marginRightPx + 38}
          y2={centerYPx}
          stroke="#4d84c3"
          strokeWidth={1.05}
          strokeDasharray="3 5"
        />

        <text x={marginLeftPx - 20} y={24} fill="#8ea0b8" fontSize={11} textAnchor="start">
          FRONT
        </text>
        <text x={canvasWidthPx - marginRightPx + 12} y={24} fill="#8ea0b8" fontSize={11} textAnchor="end">
          SENSOR
        </text>

        <g
          role="button"
          onClick={() => setSelectedId("__fixed_barrel")}
          style={{ cursor: "pointer" }}
          opacity={selectedId === "__fixed_barrel" ? 1 : 0.9}
        >
          <title>
            {overlayTooltipText(
              "Fixed PL barrel",
              preview.derived.fixedBarrelLengthMm,
              preview.derived.fixedBarrelOuterDiameterMm,
              preview.derived.fixedBarrelInnerDiameterMm
            )}
          </title>
          <rect
            x={barrelX}
            y={centerYPx - barrelHeightPx / 2}
            width={barrelWidthPx}
            height={barrelHeightPx}
            fill={barrelStyle.fill}
            stroke={selectedId === "__fixed_barrel" ? "#d8efff" : barrelStyle.stroke}
            strokeWidth={selectedId === "__fixed_barrel" ? 1.8 : 1.2}
            rx={10}
          />
          <rect
            x={barrelX + 1}
            y={centerYPx - barrelInnerHeightPx / 2}
            width={Math.max(1, barrelWidthPx - 2)}
            height={barrelInnerHeightPx}
            fill="#050505"
            stroke="rgba(150, 177, 199, 0.35)"
            strokeWidth={0.65}
            rx={4}
          />
        </g>

        <g
          role="button"
          onClick={() => setSelectedId("__carrier")}
          style={{ cursor: "pointer" }}
          opacity={selectedId === "__carrier" ? 1 : 0.95}
        >
          <title>
            {overlayTooltipText(
              "Sliding optical carrier",
              preview.derived.carrierLengthMm,
              preview.derived.carrierOuterDiameterMm,
              preview.derived.carrierInnerDiameterMm
            )}
          </title>
          <rect
            x={carrierX}
            y={centerYPx - carrierHeightPx / 2}
            width={carrierWidthPx}
            height={carrierHeightPx}
            fill={carrierStyle.fill}
            stroke={selectedId === "__carrier" ? "#d8ffeb" : carrierStyle.stroke}
            strokeWidth={selectedId === "__carrier" ? 1.8 : 1.2}
            rx={8}
          />
          <rect
            x={carrierX + 1}
            y={centerYPx - carrierInnerHeightPx / 2}
            width={Math.max(1, carrierWidthPx - 2)}
            height={carrierInnerHeightPx}
            fill="#050505"
            stroke="rgba(120, 218, 169, 0.35)"
            strokeWidth={0.55}
            rx={3}
          />
        </g>

        {sequenceWithDisplay.map((part, index) => {
          const style = ROLE_STYLE[part.colorRole];
          const x = mmToX(part.displayStartMm);
          const widthPx = Math.max(4, part.lengthMm * pxPerMmX);
          const outerHeightPx = Math.max(8, part.outerDiameterMm * diameterScale);
          const y = centerYPx - outerHeightPx / 2;
          const apertureOrInnerMm = part.apertureDiameterMm ?? part.innerDiameterMm;
          const innerHeightPx =
            apertureOrInnerMm && apertureOrInnerMm > 0
              ? Math.max(4, Math.min(outerHeightPx - 4, apertureOrInnerMm * diameterScale))
              : 0;
          const isSelected = selectedId === part.id;
          const labelY = y - 5 - (index % 2) * 10;

          return (
            <g
              key={part.id}
              role="button"
              onClick={() => setSelectedId(part.id)}
              style={{ cursor: "pointer" }}
            >
              <title>{partTooltipText(part)}</title>
              <rect
                x={x}
                y={y}
                width={widthPx}
                height={outerHeightPx}
                fill={style.fill}
                stroke={isSelected ? "#ffffff" : style.stroke}
                strokeWidth={isSelected ? 1.8 : 1.15}
                rx={4}
              />
              {innerHeightPx > 0 && (
                <rect
                  x={x + 0.9}
                  y={centerYPx - innerHeightPx / 2}
                  width={Math.max(1, widthPx - 1.8)}
                  height={innerHeightPx}
                  fill="#050505"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth={0.45}
                  rx={2}
                />
              )}
              {widthPx >= 12 && (
                <text x={x + widthPx / 2} y={labelY} fill={style.text} textAnchor="middle" fontSize={8.6}>
                  {part.shortLabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div className="panel space-y-4 overflow-hidden p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-labMuted">Assembly Preview</h3>
          <p className="text-xs text-labMuted">
            Parametric preview from Stack + Auto-fit dimensions. OpenSCAD/STL meshes are not rendered in-browser.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-labBorder bg-[#0b0b0b] p-2">
            <span className="text-[11px] uppercase tracking-[0.09em] text-labMuted">View mode</span>
            <Button
              type="button"
              variant={viewMode === "side_2d" ? "primary" : "secondary"}
              onClick={() => setViewMode("side_2d")}
            >
              2D Side
            </Button>
            <Button
              type="button"
              variant={viewMode === "interactive_3d" ? "primary" : "secondary"}
              onClick={() => setViewMode("interactive_3d")}
            >
              3D Interactive
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-labBorder bg-[#0b0b0b] p-2">
            <span className="text-[11px] uppercase tracking-[0.09em] text-labMuted">Assembly mode</span>
            <Button
              type="button"
              variant={assemblyMode === "assembled" ? "primary" : "secondary"}
              onClick={() => setAssemblyMode("assembled")}
            >
              Assembled
            </Button>
            <Button
              type="button"
              variant={assemblyMode === "exploded" ? "primary" : "secondary"}
              onClick={() => setAssemblyMode("exploded")}
            >
              Exploded
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-labBorder bg-[#0b0b0b] px-3 py-2">
        {LEGEND_ITEMS.map((item) => {
          const style = ROLE_STYLE[item.role];
          return (
            <span key={item.label} className="inline-flex items-center gap-2 text-xs text-labMuted">
              <span className="h-3.5 w-5 rounded-sm border" style={{ backgroundColor: style.fill, borderColor: style.stroke }} />
              {item.label}
            </span>
          );
        })}
      </div>

      {assemblyMode === "exploded" && (
        <p className="text-xs text-labMuted">
          Exploded view adds visual separation only. Z table remains true assembled positions.
        </p>
      )}

      {viewMode === "interactive_3d" && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => setThreeResetSignal((value) => value + 1)}>
              Reset view
            </Button>
            <p className="text-xs text-labMuted">
              3D preview is simplified/parametric. Final geometry should still be checked in OpenSCAD/Cura/FreeCAD.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-labBorder bg-[#0b0b0b] px-3 py-2">
            <label className="inline-flex items-center gap-2 text-xs text-labMuted">
              <input
                type="checkbox"
                checked={threeDisplay.showFixedBarrel}
                onChange={(event) =>
                  setThreeDisplay((previous) => ({ ...previous, showFixedBarrel: event.target.checked }))
                }
              />
              Show fixed barrel
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-labMuted">
              <input
                type="checkbox"
                checked={threeDisplay.showCarrier}
                onChange={(event) =>
                  setThreeDisplay((previous) => ({ ...previous, showCarrier: event.target.checked }))
                }
              />
              Show optical carrier
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-labMuted">
              <input
                type="checkbox"
                checked={threeDisplay.showCupsAndSpacers}
                onChange={(event) =>
                  setThreeDisplay((previous) => ({ ...previous, showCupsAndSpacers: event.target.checked }))
                }
              />
              Show cups/spacers
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-labMuted">
              <input
                type="checkbox"
                checked={threeDisplay.showInserts}
                onChange={(event) =>
                  setThreeDisplay((previous) => ({ ...previous, showInserts: event.target.checked }))
                }
              />
              Show inserts/iris
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-labMuted">
              <input
                type="checkbox"
                checked={threeDisplay.xRayMode}
                onChange={(event) =>
                  setThreeDisplay((previous) => ({ ...previous, xRayMode: event.target.checked }))
                }
              />
              X-ray mode
            </label>
          </div>
        </div>
      )}

      {selectedInfo && (
        <div className="rounded-xl border border-labBorder bg-[#0b0b0b] p-3 text-xs">
          <p className="text-labText">{selectedInfo.title}</p>
          <p className="mt-1 text-labMuted">{selectedInfo.body}</p>
        </div>
      )}

      {show3dFallback && (
        <p className="text-xs text-labWarning">
          3D preview unavailable; using 2D parametric preview.
        </p>
      )}

      {viewMode === "interactive_3d" && !show3dFallback ? (
        <ThreeAssemblyPreview
          parts={sequenceWithDisplay}
          derived={preview.derived}
          selectedId={selectedId}
          onSelectId={setSelectedId}
          onAvailabilityChange={(available) => setThreeAvailability(available ? "ready" : "unavailable")}
          resetSignal={threeResetSignal}
          displayOptions={threeDisplay}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-labBorder bg-[#060606]">{renderSide2D()}</div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-labBorder bg-[#0b0b0b] p-3 text-xs text-labMuted">
          <p>
            Mechanical stack length: <span className="mono text-labText">{prettyMm(preview.derived.mechanicalStackLengthMm)} mm</span>
          </p>
          <p>
            Optical stack length: <span className="mono text-labText">{prettyMm(preview.derived.opticalStackLengthMm)} mm</span>
          </p>
          <p>
            Carrier length: <span className="mono text-labText">{prettyMm(preview.derived.carrierLengthMm)} mm</span>
          </p>
          <p>
            Fixed barrel length: <span className="mono text-labText">{prettyMm(preview.derived.fixedBarrelLengthMm)} mm</span>
          </p>
        </div>

        <div className="rounded-xl border border-labBorder bg-[#0b0b0b] p-3 text-xs text-labMuted">
          <p>
            Largest glass diameter: <span className="mono text-labText">{prettyMm(preview.derived.largestGlassDiameterMm)} mm</span>
          </p>
          <p>
            Target stack OD: <span className="mono text-labText">{prettyMm(preview.derived.targetStackOuterDiameterMm)} mm</span>
          </p>
          <p>
            Carrier ID / OD: <span className="mono text-labText">{prettyMm(preview.derived.carrierInnerDiameterMm)} / {prettyMm(preview.derived.carrierOuterDiameterMm)} mm</span>
          </p>
          <p>
            Fixed barrel ID / OD: <span className="mono text-labText">{prettyMm(preview.derived.fixedBarrelInnerDiameterMm)} / {prettyMm(preview.derived.fixedBarrelOuterDiameterMm)} mm</span>
          </p>
        </div>

        <div className="rounded-xl border border-labBorder bg-[#0b0b0b] p-3 text-xs text-labMuted">
          <p>
            Slot length: <span className="mono text-labText">{prettyMm(preview.derived.slotLengthMm)} mm</span>
          </p>
          <p>
            Recommended focus travel: <span className="mono text-labText">{prettyMm(preview.derived.recommendedFocusTravelMm)} mm</span>
          </p>
          <p>
            Recommended slot length: <span className="mono text-labText">{prettyMm(preview.derived.recommendedSlotLengthMm)} mm</span>
          </p>
          <p>
            Target mount throat: <span className="mono text-labText">{prettyMm(preview.derived.targetMountThroatDiameterMm)} mm</span>
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-labBorder bg-[#0b0b0b] p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-labMuted">Fit Status</p>
        {checksSorted.length === 0 ? (
          <p className="text-xs text-labMuted">No fit checks available.</p>
        ) : (
          <div className="space-y-2">
            {checksSorted.map((check, index) => (
              <div key={`${check.id}-${index}`} className={`text-xs ${checkStatusClass(check.status)}`}>
                <p className="mono">
                  {checkStatusIcon(check.status)} {check.label}
                </p>
                <p className="pl-4">{check.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-labBorder bg-[#0b0b0b]">
        <table className="min-w-full text-left text-xs text-labMuted">
          <thead className="border-b border-labBorder bg-[#111] text-[11px] uppercase tracking-[0.08em] text-labMuted">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Part</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Start Z</th>
              <th className="px-3 py-2">End Z</th>
              <th className="px-3 py-2">Length</th>
              <th className="px-3 py-2">OD</th>
              <th className="px-3 py-2">ID / Aperture</th>
              <th className="px-3 py-2">Source / Notes</th>
            </tr>
          </thead>
          <tbody>
            {sequenceWithDisplay.map((part, index) => {
              const isSelected = selectedId === part.id;
              return (
                <tr
                  key={part.id}
                  className={`border-b border-labBorder/60 last:border-b-0 ${isSelected ? "bg-[#142032]" : ""}`}
                  onClick={() => setSelectedId(part.id)}
                  style={{ cursor: "pointer" }}
                  title={partTooltipText(part)}
                >
                  <td className="px-3 py-2 mono text-labText">{String(index + 1).padStart(2, "0")}</td>
                  <td className="px-3 py-2 text-labText">{part.label}</td>
                  <td className="px-3 py-2 mono">{part.type}</td>
                  <td className="px-3 py-2 mono">{prettyMm(part.startZMm)}</td>
                  <td className="px-3 py-2 mono">{prettyMm(part.endZMm)}</td>
                  <td className="px-3 py-2 mono">{prettyMm(part.lengthMm)}</td>
                  <td className="px-3 py-2 mono">{prettyMm(part.outerDiameterMm)}</td>
                  <td className="px-3 py-2 mono">
                    {part.apertureDiameterMm
                      ? `A ${prettyMm(part.apertureDiameterMm)}`
                      : part.innerDiameterMm
                        ? `ID ${prettyMm(part.innerDiameterMm)}`
                        : "-"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-labText">{part.sourceLabel ?? "-"}</span>
                    {part.notes ? <span className="text-labMuted"> · {part.notes}</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-labBorder bg-[#0b0b0b] p-3">
        <p className="text-xs text-labMuted">{preview.limitations[0]}</p>
      </div>
    </div>
  );
}
