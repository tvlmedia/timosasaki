"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/common/Button";
import { getAssemblyPreviewData, type AssemblyPreviewPart } from "@/lib/assemblyPreview";
import type { LensProject } from "@/types";

type AssemblyViewMode = "assembled" | "exploded";

const PART_STYLE: Record<
  AssemblyPreviewPart["type"],
  { fill: string; stroke: string; text: string }
> = {
  lens_cup: { fill: "rgba(222, 187, 66, 0.28)", stroke: "#d5b44b", text: "#f5dd8a" },
  spacer: { fill: "rgba(188, 196, 205, 0.2)", stroke: "#b5bec8", text: "#d7dbe0" },
  insert_iris: { fill: "rgba(255, 164, 45, 0.34)", stroke: "#ffac4a", text: "#ffd39c" },
  insert_filter: { fill: "rgba(255, 194, 97, 0.3)", stroke: "#ffce80", text: "#ffe0ab" },
  insert_diffusion: { fill: "rgba(191, 108, 255, 0.28)", stroke: "#c791ff", text: "#e4c9ff" },
  insert_custom: { fill: "rgba(152, 166, 186, 0.26)", stroke: "#aebad0", text: "#d2dae7" },
  iris_disk: { fill: "rgba(255, 164, 45, 0.34)", stroke: "#ffac4a", text: "#ffd39c" },
  diffusion_disk: { fill: "rgba(191, 108, 255, 0.28)", stroke: "#c791ff", text: "#e4c9ff" },
  retaining_ring: { fill: "rgba(138, 146, 155, 0.24)", stroke: "#9ea8b1", text: "#c4cacf" },
  custom: { fill: "rgba(132, 140, 150, 0.24)", stroke: "#99a4af", text: "#cdd4db" }
};

function prettyMm(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toFixed(3);
}

function shortLabel(value: string, maxLength = 24): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

export function AssemblyPreviewPanel({ project }: { project: LensProject }) {
  const [viewMode, setViewMode] = useState<AssemblyViewMode>("assembled");

  const preview = useMemo(() => getAssemblyPreviewData(project), [project]);
  const explodedGapMm = 6.0;
  const sequenceWithDisplay = useMemo(() => {
    return preview.sequence.map((part, index) => {
      const explodedOffset = viewMode === "exploded" ? index * explodedGapMm : 0;
      const displayStartMm = Number((part.startZMm + explodedOffset).toFixed(3));
      const displayEndMm = Number((displayStartMm + part.lengthMm).toFixed(3));
      return {
        ...part,
        displayStartMm,
        displayEndMm
      };
    });
  }, [preview.sequence, viewMode]);

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

  const pxPerMmX = 8;
  const marginLeftPx = 70;
  const marginRightPx = 100;
  const canvasHeightPx = 430;
  const centerYPx = 220;
  const maxOuterHeightPx = 230;
  const diameterScale = maxOuterHeightPx / maxOuterDiameterMm;
  const canvasWidthPx = Math.max(
    980,
    Math.round(displayStackLengthMm * pxPerMmX + marginLeftPx + marginRightPx)
  );
  const mmToX = (valueMm: number) => marginLeftPx + (valueMm - displayStackStartMm) * pxPerMmX;

  const carrierVisualLengthMm = Math.max(preview.derived.carrierLengthMm, displayStackLengthMm);
  const barrelVisualLengthMm = Math.max(preview.derived.fixedBarrelLengthMm, displayStackLengthMm);

  const statuses = preview.statuses;
  const statusColor = (status: "ok" | "warning" | "error"): string => {
    if (status === "error") return "text-labDanger";
    if (status === "warning") return "text-labWarning";
    return "text-[#7fd89b]";
  };
  const statusBadge = (status: "ok" | "warning" | "error"): string => {
    if (status === "error") return "ERROR";
    if (status === "warning") return "WARNING";
    return "OK";
  };

  return (
    <div className="panel space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-labMuted">Assembly Preview</h3>
          <p className="text-xs text-labMuted">
            Parametric preview from Stack + Auto-fit data. No OpenSCAD mesh rendering.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={viewMode === "assembled" ? "primary" : "secondary"}
            onClick={() => setViewMode("assembled")}
          >
            Assembled
          </Button>
          <Button
            type="button"
            variant={viewMode === "exploded" ? "primary" : "secondary"}
            onClick={() => setViewMode("exploded")}
          >
            Exploded
          </Button>
        </div>
      </div>

      {viewMode === "exploded" && (
        <p className="text-xs text-labMuted">
          Exploded view adds visual separation only. Z table remains true assembled positions.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-labBorder bg-[#060606]">
        <svg width={canvasWidthPx} height={canvasHeightPx} className="block">
          <line
            x1={marginLeftPx - 30}
            y1={centerYPx}
            x2={canvasWidthPx - marginRightPx + 30}
            y2={centerYPx}
            stroke="#1d2f45"
            strokeWidth={1}
          />

          <text x={marginLeftPx - 18} y={24} fill="#8f9db0" fontSize={11} textAnchor="start">
            FRONT
          </text>
          <text x={canvasWidthPx - marginRightPx + 10} y={24} fill="#8f9db0" fontSize={11} textAnchor="end">
            SENSOR
          </text>

          {(() => {
            const barrelHeightPx = Math.max(14, preview.derived.fixedBarrelOuterDiameterMm * diameterScale);
            const barrelInnerHeightPx = Math.max(
              6,
              Math.min(barrelHeightPx - 4, preview.derived.fixedBarrelInnerDiameterMm * diameterScale)
            );
            const barrelX = mmToX(displayStackStartMm);
            const barrelWidthPx = barrelVisualLengthMm * pxPerMmX;
            return (
              <g>
                <rect
                  x={barrelX}
                  y={centerYPx - barrelHeightPx / 2}
                  width={barrelWidthPx}
                  height={barrelHeightPx}
                  fill="rgba(86, 116, 143, 0.12)"
                  stroke="#6f88a1"
                  strokeWidth={1.2}
                  rx={10}
                />
                <rect
                  x={barrelX + 1}
                  y={centerYPx - barrelInnerHeightPx / 2}
                  width={Math.max(1, barrelWidthPx - 2)}
                  height={barrelInnerHeightPx}
                  fill="#050505"
                  stroke="#2c3a46"
                  strokeWidth={0.6}
                  rx={4}
                />
                <text x={barrelX + 8} y={centerYPx - barrelHeightPx / 2 - 4} fill="#8ea4bd" fontSize={9}>
                  Fixed PL barrel
                </text>
              </g>
            );
          })()}

          {(() => {
            const carrierHeightPx = Math.max(12, preview.derived.carrierOuterDiameterMm * diameterScale);
            const carrierInnerHeightPx = Math.max(
              6,
              Math.min(carrierHeightPx - 4, preview.derived.carrierInnerDiameterMm * diameterScale)
            );
            const carrierX = mmToX(displayStackStartMm);
            const carrierWidthPx = carrierVisualLengthMm * pxPerMmX;
            return (
              <g>
                <rect
                  x={carrierX}
                  y={centerYPx - carrierHeightPx / 2}
                  width={carrierWidthPx}
                  height={carrierHeightPx}
                  fill="rgba(67, 164, 113, 0.14)"
                  stroke="#63c793"
                  strokeWidth={1.2}
                  rx={8}
                />
                <rect
                  x={carrierX + 1}
                  y={centerYPx - carrierInnerHeightPx / 2}
                  width={Math.max(1, carrierWidthPx - 2)}
                  height={carrierInnerHeightPx}
                  fill="#050505"
                  stroke="#24503d"
                  strokeWidth={0.6}
                  rx={3}
                />
                <text x={carrierX + 8} y={centerYPx - carrierHeightPx / 2 - 4} fill="#78d6a9" fontSize={9}>
                  Sliding optical carrier
                </text>
              </g>
            );
          })()}

          {sequenceWithDisplay.map((part) => {
            const style = PART_STYLE[part.type];
            const x = mmToX(part.displayStartMm);
            const widthPx = Math.max(2, part.lengthMm * pxPerMmX);
            const outerHeightPx = Math.max(8, part.outerDiameterMm * diameterScale);
            const y = centerYPx - outerHeightPx / 2;
            const apertureOrInnerMm = part.apertureDiameterMm ?? part.innerDiameterMm;
            const innerHeightPx =
              apertureOrInnerMm && apertureOrInnerMm > 0
                ? Math.max(4, Math.min(outerHeightPx - 4, apertureOrInnerMm * diameterScale))
                : 0;
            return (
              <g key={part.id}>
                <rect
                  x={x}
                  y={y}
                  width={widthPx}
                  height={outerHeightPx}
                  fill={style.fill}
                  stroke={style.stroke}
                  strokeWidth={1.15}
                  rx={4}
                />
                {innerHeightPx > 0 && (
                  <rect
                    x={x + 0.8}
                    y={centerYPx - innerHeightPx / 2}
                    width={Math.max(1, widthPx - 1.6)}
                    height={innerHeightPx}
                    fill="#050505"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={0.4}
                    rx={2}
                  />
                )}
                {widthPx > 34 && (
                  <text x={x + widthPx / 2} y={y - 5} fill={style.text} textAnchor="middle" fontSize={8.8}>
                    {shortLabel(part.label, 22)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
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
            Carrier ID / OD:{" "}
            <span className="mono text-labText">
              {prettyMm(preview.derived.carrierInnerDiameterMm)} / {prettyMm(preview.derived.carrierOuterDiameterMm)} mm
            </span>
          </p>
          <p>
            Fixed barrel ID / OD:{" "}
            <span className="mono text-labText">
              {prettyMm(preview.derived.fixedBarrelInnerDiameterMm)} / {prettyMm(preview.derived.fixedBarrelOuterDiameterMm)} mm
            </span>
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-labBorder bg-[#0b0b0b] p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-labMuted">Fit Status</p>
        {statuses.length === 0 ? (
          <p className="text-xs text-labMuted">No fit status lines.</p>
        ) : (
          <div className="space-y-1">
            {statuses.map((line, index) => (
              <p key={`${line.status}-${line.message}-${index}`} className={`text-xs ${statusColor(line.status)}`}>
                <span className="mono mr-2">{statusBadge(line.status)}</span>
                {line.message}
              </p>
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
              <th className="px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {sequenceWithDisplay.map((part, index) => (
              <tr key={part.id} className="border-b border-labBorder/60 last:border-b-0">
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
                <td className="px-3 py-2">{part.notes ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
