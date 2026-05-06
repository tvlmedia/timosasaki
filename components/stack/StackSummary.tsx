"use client";

import {
  getLargestGlassDiameter,
  getRecommendedBarrelInnerDiameter,
  getRecommendedBarrelOuterDiameter,
  getStackWarnings,
  getTotalStackLength
} from "@/lib/calculations";
import { WarningBox } from "@/components/common/WarningBox";
import type { CadDefaults, StackItem } from "@/types";

export function StackSummary({ items, defaults }: { items: StackItem[]; defaults: CadDefaults }) {
  const totalLength = getTotalStackLength(items);
  const largestGlass = getLargestGlassDiameter(items);
  const recommendedInner = getRecommendedBarrelInnerDiameter(items, defaults);
  const recommendedOuter = getRecommendedBarrelOuterDiameter(items, defaults);
  const warnings = getStackWarnings(items, defaults);

  return (
    <div className="space-y-3">
      <div className="panel p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-labMuted">Stack Summary</h3>
        <div className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-labMuted">Total stack length</span>
            <span className="mono">{totalLength.toFixed(2)} mm</span>
          </div>
          <div className="flex justify-between">
            <span className="text-labMuted">Largest glass diameter</span>
            <span className="mono">{largestGlass.toFixed(2)} mm</span>
          </div>
          <div className="flex justify-between">
            <span className="text-labMuted">Recommended barrel ID</span>
            <span className="mono">{recommendedInner.toFixed(2)} mm</span>
          </div>
          <div className="flex justify-between">
            <span className="text-labMuted">Recommended barrel OD</span>
            <span className="mono">{recommendedOuter.toFixed(2)} mm</span>
          </div>
        </div>
      </div>
      <WarningBox title="Warnings" lines={warnings} />
    </div>
  );
}
