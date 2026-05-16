"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/common/Button";
import { NumberInput } from "@/components/common/NumberInput";
import { getGlobalCadDefaults, saveGlobalCadDefaults } from "@/lib/storage";
import type { CadDefaults } from "@/types";

export default function SettingsPage() {
  const [defaults, setDefaults] = useState<CadDefaults | null>(null);

  useEffect(() => {
    setDefaults(getGlobalCadDefaults());
  }, []);

  if (!defaults) {
    return (
      <AppShell title="Settings">
        <div className="panel p-4">
          <p className="text-labMuted">Loading settings...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Settings">
      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <div className="panel space-y-3 p-4">
          <h3 className="text-base font-semibold">Global CAD Defaults</h3>
          <NumberInput
            label="Print tolerance (mm)"
            value={defaults.printToleranceMm}
            min={0}
            step={0.01}
            onChange={(event) => setDefaults((prev) => (prev ? { ...prev, printToleranceMm: Number(event.target.value) } : prev))}
          />
          <NumberInput
            label="Radial clearance (mm)"
            value={defaults.radialClearanceMm}
            min={0}
            step={0.01}
            onChange={(event) => setDefaults((prev) => (prev ? { ...prev, radialClearanceMm: Number(event.target.value) } : prev))}
          />
          <NumberInput
            label="Wall thickness (mm)"
            value={defaults.wallThicknessMm}
            min={0}
            step={0.05}
            onChange={(event) => setDefaults((prev) => (prev ? { ...prev, wallThicknessMm: Number(event.target.value) } : prev))}
          />
          <NumberInput
            label="Cup-to-carrier clearance (mm)"
            value={defaults.cupToCarrierClearanceMm ?? 0.6}
            min={0}
            step={0.01}
            onChange={(event) =>
              setDefaults((prev) =>
                prev ? { ...prev, cupToCarrierClearanceMm: Number(event.target.value) } : prev
              )
            }
          />
          <NumberInput
            label="Target stack outer diameter override (mm, 0 = auto)"
            value={defaults.targetStackOuterDiameterMm ?? 0}
            min={0}
            step={0.01}
            onChange={(event) => {
              const next = Number(event.target.value);
              setDefaults((prev) =>
                prev
                  ? {
                      ...prev,
                      targetStackOuterDiameterMm: Number.isFinite(next) && next > 0 ? next : undefined
                    }
                  : prev
              );
            }}
          />
          <NumberInput
            label="Carrier inner diameter override (mm, 0 = auto)"
            value={defaults.carrierInnerDiameterMm ?? 0}
            min={0}
            step={0.01}
            onChange={(event) => {
              const next = Number(event.target.value);
              setDefaults((prev) =>
                prev
                  ? {
                      ...prev,
                      carrierInnerDiameterMm: Number.isFinite(next) && next > 0 ? next : undefined
                    }
                  : prev
              );
            }}
          />
          <NumberInput
            label="Carrier wall thickness override (mm, 0 = auto)"
            value={defaults.carrierWallThicknessMm ?? 0}
            min={0}
            step={0.01}
            onChange={(event) => {
              const next = Number(event.target.value);
              setDefaults((prev) =>
                prev
                  ? {
                      ...prev,
                      carrierWallThicknessMm: Number.isFinite(next) && next > 0 ? next : undefined
                    }
                  : prev
              );
            }}
          />
          <NumberInput
            label="Carrier-to-barrel clearance override (mm, 0 = auto)"
            value={defaults.carrierToBarrelClearanceMm ?? 0}
            min={0}
            step={0.01}
            onChange={(event) => {
              const next = Number(event.target.value);
              setDefaults((prev) =>
                prev
                  ? {
                      ...prev,
                      carrierToBarrelClearanceMm: Number.isFinite(next) && next > 0 ? next : undefined
                    }
                  : prev
              );
            }}
          />
          <NumberInput
            label="Fixed barrel inner diameter override (mm, 0 = auto)"
            value={defaults.fixedBarrelInnerDiameterMm ?? 0}
            min={0}
            step={0.01}
            onChange={(event) => {
              const next = Number(event.target.value);
              setDefaults((prev) =>
                prev
                  ? {
                      ...prev,
                      fixedBarrelInnerDiameterMm: Number.isFinite(next) && next > 0 ? next : undefined
                    }
                  : prev
              );
            }}
          />
          <NumberInput
            label="Fixed barrel wall thickness override (mm, 0 = auto)"
            value={defaults.fixedBarrelWallThicknessMm ?? 0}
            min={0}
            step={0.01}
            onChange={(event) => {
              const next = Number(event.target.value);
              setDefaults((prev) =>
                prev
                  ? {
                      ...prev,
                      fixedBarrelWallThicknessMm: Number.isFinite(next) && next > 0 ? next : undefined
                    }
                  : prev
              );
            }}
          />
          <NumberInput
            label="Retaining lip (mm)"
            value={defaults.retainingLipMm}
            min={0}
            step={0.05}
            onChange={(event) => setDefaults((prev) => (prev ? { ...prev, retainingLipMm: Number(event.target.value) } : prev))}
          />
          <NumberInput
            label="Default screw diameter (mm)"
            value={defaults.screwDiameterMm}
            min={0}
            step={0.05}
            onChange={(event) => setDefaults((prev) => (prev ? { ...prev, screwDiameterMm: Number(event.target.value) } : prev))}
          />
          <NumberInput
            label="Default cam pin diameter (mm)"
            value={defaults.camPinDiameterMm}
            min={0}
            step={0.05}
            onChange={(event) => setDefaults((prev) => (prev ? { ...prev, camPinDiameterMm: Number(event.target.value) } : prev))}
          />
          <NumberInput
            label="Cam slot clearance (mm)"
            value={defaults.camSlotClearanceMm}
            min={0}
            step={0.01}
            onChange={(event) => setDefaults((prev) => (prev ? { ...prev, camSlotClearanceMm: Number(event.target.value) } : prev))}
          />
          <NumberInput
            label="OpenSCAD facets ($fn)"
            value={defaults.facets}
            min={12}
            step={1}
            onChange={(event) => setDefaults((prev) => (prev ? { ...prev, facets: Number(event.target.value) } : prev))}
          />
          <Button
            variant="primary"
            onClick={() => {
              saveGlobalCadDefaults(defaults);
            }}
          >
            Save Settings
          </Button>
        </div>

        <div className="panel p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-labMuted">Roadmap TODO</h3>
          <ul className="list-disc space-y-2 pl-5 text-sm text-labMuted">
            <li>Direct STL export</li>
            <li>STEP export</li>
            <li>FreeCAD macro export</li>
            <li>Real raytracing</li>
            <li>AI suggestion engine</li>
            <li>Supabase/cloud sync</li>
            <li>Team sharing</li>
            <li>Printable technical drawing PDF</li>
            <li>Before/after image slider</li>
            <li>Lens DNA radar chart</li>
            <li>T-stop estimate</li>
            <li>Flange depth simulation</li>
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
