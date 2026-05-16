import { createDemoProject, createEmptyMeasurementsState, defaultCadDefaults, defaultTargetLook } from "@/lib/defaults";
import { defaultFocusTravelSetup, normalizeFocusTravelSetup } from "@/lib/focusTravel";
import { createId, safeFileName } from "@/lib/ids";
import type {
  BaselineAirGap,
  BaselinePhysicalComponent,
  CadDefaults,
  LensProject,
  MechanicalPart,
  MeasurementsState,
  OriginalLensBaseline
} from "@/types";

const STORAGE_KEY = "sasaki-lens-lab-projects-v1";
const SETTINGS_KEY = "sasaki-lens-lab-settings-v1";

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function readJson<T>(key: string): T | null {
  if (!hasWindow()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function isLensProjectCandidate(value: unknown): value is LensProject {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.notes === "string" &&
    Array.isArray(record.stackItems) &&
    Array.isArray(record.experiments)
  );
}

function toPositive(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

function buildSteppedSegmentsFromMeasurementFields(fields: {
  hasSteppedProfile?: boolean;
  largeDiameterMm?: number;
  smallDiameterMm?: number;
  largeSectionThicknessMm?: number;
  smallSectionThicknessMm?: number;
  stepDirection?: "large_side_front" | "large_side_rear" | "unknown";
  steppedProfileSegments?: Array<{
    id?: string;
    name?: string;
    diameterMm?: number;
    depthMm?: number;
  }>;
}): Array<{ id: string; name?: string; diameterMm: number; depthMm: number }> {
  const explicitSegments = (fields.steppedProfileSegments ?? [])
    .map((segment, index) => ({
      id: segment.id || `profile-${index + 1}`,
      name: segment.name?.trim() || `Segment ${index + 1}`,
      diameterMm: toPositive(segment.diameterMm),
      depthMm: toPositive(segment.depthMm)
    }))
    .filter((segment) => segment.diameterMm > 0 && segment.depthMm > 0);

  const largeDiameterMm = toPositive(fields.largeDiameterMm);
  const smallDiameterMm = toPositive(fields.smallDiameterMm);
  const largeSectionThicknessMm = toPositive(fields.largeSectionThicknessMm);
  const smallSectionThicknessMm = toPositive(fields.smallSectionThicknessMm);
  const hasCompleteStepped =
    largeDiameterMm > 0 && smallDiameterMm > 0 && largeSectionThicknessMm > 0 && smallSectionThicknessMm > 0;

  if (!fields.hasSteppedProfile) {
    return explicitSegments;
  }
  if (hasCompleteStepped) {
    if (explicitSegments.length >= 2) return explicitSegments;
    if (fields.stepDirection === "large_side_front") {
      return [
        {
          id: "profile-front-large",
          name: "Large section (front)",
          diameterMm: largeDiameterMm,
          depthMm: largeSectionThicknessMm
        },
        {
          id: "profile-rear-small",
          name: "Small section (rear)",
          diameterMm: smallDiameterMm,
          depthMm: smallSectionThicknessMm
        }
      ];
    }
    return [
      {
        id: "profile-front-small",
        name: "Small section (front)",
        diameterMm: smallDiameterMm,
        depthMm: smallSectionThicknessMm
      },
      {
        id: "profile-rear-large",
        name: "Large section (rear)",
        diameterMm: largeDiameterMm,
        depthMm: largeSectionThicknessMm
      }
    ];
  }
  return explicitSegments;
}

export function normalizeProject(project: LensProject): LensProject {
  const now = new Date().toISOString();
  const normalizedMeasurements = normalizeMeasurements(project.measurements, now);
  const annotationById = new Map(
    normalizedMeasurements.annotations.map((annotation) => [annotation.id, annotation] as const)
  );
  const inputStackItems = [...(project.stackItems ?? [])];
  const opticalStackItems = inputStackItems.filter((item) => item.type !== "barrel");
  const migratedBarrels = inputStackItems
    .filter((item): item is Extract<typeof item, { type: "barrel" }> => item.type === "barrel")
    .map(barrelStackItemToMechanicalPart);
  const existingMechanical = (project.mechanicalParts ?? []).map(normalizeMechanicalPart);
  const mechanicalParts = [...existingMechanical, ...migratedBarrels].filter(
    (part, index, all) => all.findIndex((entry) => entry.id === part.id) === index
  );

  return {
    ...project,
    notes: project.notes ?? "",
    targetLook: project.targetLook ?? { ...defaultTargetLook },
    cadDefaults: {
      ...defaultCadDefaults,
      ...(project.cadDefaults ?? {})
    },
    stackItems: opticalStackItems
      .map((item, index) => {
        const base = { ...item, positionIndex: index };
        if (base.type === "spacer") {
          const mode =
            base.spacerDiameterMode === "match_lens_cups" ||
            base.spacerDiameterMode === "manual"
              ? base.spacerDiameterMode
              : base.spacerDiameterMode === "match_carrier"
                ? "match_lens_cups"
                : base.autoFitToBarrel === false
                  ? "manual"
                  : "match_lens_cups";
          return {
            ...base,
            autoFitToBarrel: mode !== "manual",
            spacerDiameterMode: mode,
            manualInnerDiameterMm:
              Number.isFinite(base.manualInnerDiameterMm ?? Number.NaN) && (base.manualInnerDiameterMm as number) > 0
                ? base.manualInnerDiameterMm
                : mode === "manual"
                  ? base.innerDiameterMm
                  : undefined,
            manualOuterDiameterMm:
              Number.isFinite(base.manualOuterDiameterMm ?? Number.NaN) && (base.manualOuterDiameterMm as number) > 0
                ? base.manualOuterDiameterMm
                : mode === "manual"
                  ? base.outerDiameterMm
                  : undefined
          };
        }
        if (base.type === "retaining_ring") {
          return {
            ...base,
            autoFitToBarrel: base.autoFitToBarrel ?? true
          };
        }
        if (base.type !== "glass") return base;
        const linkedAnnotation = base.sourceMeasurementAnnotationId
          ? annotationById.get(base.sourceMeasurementAnnotationId)
          : undefined;
        const linkedFields = linkedAnnotation?.itemType === "glass" ? linkedAnnotation.fields : undefined;
        const linkedStepped = linkedFields
          ? {
              hasSteppedProfile: Boolean(linkedFields.hasSteppedProfile),
              largeDiameterMm: toPositive(linkedFields.largeDiameterMm) > 0 ? linkedFields.largeDiameterMm : undefined,
              smallDiameterMm: toPositive(linkedFields.smallDiameterMm) > 0 ? linkedFields.smallDiameterMm : undefined,
              largeSectionThicknessMm:
                toPositive(linkedFields.largeSectionThicknessMm) > 0 ? linkedFields.largeSectionThicknessMm : undefined,
              smallSectionThicknessMm:
                toPositive(linkedFields.smallSectionThicknessMm) > 0 ? linkedFields.smallSectionThicknessMm : undefined,
              stepDirection: linkedFields.stepDirection ?? "unknown",
              profileSegments: buildSteppedSegmentsFromMeasurementFields(linkedFields)
            }
          : undefined;

        const shouldHydrateSteppedFromMeasurement =
          Boolean(linkedStepped?.hasSteppedProfile) &&
          (!base.hasSteppedProfile ||
            toPositive(base.largeDiameterMm) <= 0 ||
            toPositive(base.smallDiameterMm) <= 0 ||
            toPositive(base.largeSectionThicknessMm) <= 0 ||
            toPositive(base.smallSectionThicknessMm) <= 0);

        const hydratedStepped = shouldHydrateSteppedFromMeasurement
          ? {
              hasSteppedProfile: linkedStepped?.hasSteppedProfile,
              largeDiameterMm: linkedStepped?.largeDiameterMm,
              smallDiameterMm: linkedStepped?.smallDiameterMm,
              largeSectionThicknessMm: linkedStepped?.largeSectionThicknessMm,
              smallSectionThicknessMm: linkedStepped?.smallSectionThicknessMm,
              stepDirection: linkedStepped?.stepDirection,
              advancedProfileEnabled:
                (linkedStepped?.profileSegments?.length ?? 0) > 0 ? true : base.advancedProfileEnabled,
              profileSegments:
                (linkedStepped?.profileSegments?.length ?? 0) > 0
                  ? linkedStepped?.profileSegments
                  : base.profileSegments
            }
          : {};
        return {
          ...base,
          physicalComponentMode: base.physicalComponentMode ?? "single_element",
          opticalSubElements: base.opticalSubElements ?? [],
          ...hydratedStepped
        };
      })
      .sort((a, b) => a.positionIndex - b.positionIndex),
    mechanicalParts,
    experiments: project.experiments ?? [],
    measurements: normalizedMeasurements,
    focusTravel: normalizeFocusTravelSetup(project.focusTravel),
    originalLensBaseline: normalizeOriginalLensBaseline(project.originalLensBaseline),
    createdAt: project.createdAt ?? now,
    updatedAt: project.updatedAt ?? now
  };
}

function defaultSurroundsStack(type: MechanicalPart["type"]): boolean {
  return type !== "mount_reference";
}

function normalizeMechanicalPart(part: MechanicalPart): MechanicalPart {
  return {
    ...part,
    surroundsStack: part.surroundsStack ?? defaultSurroundsStack(part.type),
    contributesToOpticalStackLength: part.contributesToOpticalStackLength ?? false
  };
}

function barrelStackItemToMechanicalPart(
  item: Extract<LensProject["stackItems"][number], { type: "barrel" }>
): MechanicalPart {
  return normalizeMechanicalPart({
    id: item.id,
    type: "barrel",
    name: item.name || "Barrel",
    innerDiameterMm: item.innerDiameterMm,
    outerDiameterMm: item.outerDiameterMm,
    lengthMm: item.lengthMm,
    notes: item.notes,
    surroundsStack: true,
    contributesToOpticalStackLength: item.contributesToOpticalStackLength ?? false
  });
}

function normalizeBaselineComponent(component: BaselinePhysicalComponent): BaselinePhysicalComponent {
  return {
    ...component,
    componentMode: component.componentMode ?? "single_element",
    opticalSubElements: component.opticalSubElements ?? []
  };
}

function normalizeBaselineAirGap(gap: BaselineAirGap): BaselineAirGap {
  return {
    ...gap,
    thicknessMm: Number.isFinite(gap.thicknessMm) ? gap.thicknessMm : 1,
    innerDiameterMm: Number.isFinite(gap.innerDiameterMm) ? gap.innerDiameterMm : 20,
    outerDiameterMm: Number.isFinite(gap.outerDiameterMm) ? gap.outerDiameterMm : 38
  };
}

function normalizeOriginalLensBaseline(
  baseline: OriginalLensBaseline | undefined
): OriginalLensBaseline | undefined {
  if (!baseline) return undefined;
  if (!baseline.id || !baseline.name) return undefined;
  return {
    ...baseline,
    sourceMeasurementPhotoIds: baseline.sourceMeasurementPhotoIds ?? [],
    physicalComponents: (baseline.physicalComponents ?? []).map(normalizeBaselineComponent),
    airGaps: (baseline.airGaps ?? []).map(normalizeBaselineAirGap),
    createdAt: baseline.createdAt ?? new Date().toISOString(),
    updatedAt: baseline.updatedAt ?? new Date().toISOString(),
    originalMount: baseline.originalMount ?? "M42",
    originalFlangeDistanceMm:
      Number.isFinite(baseline.originalFlangeDistanceMm) && baseline.originalFlangeDistanceMm > 0
        ? baseline.originalFlangeDistanceMm
        : 45.46
  };
}

function normalizeMeasurements(
  measurements: MeasurementsState | undefined,
  nowIso: string
): MeasurementsState {
  const base = createEmptyMeasurementsState(nowIso);
  if (!measurements) return base;
  return {
    ...base,
    ...measurements,
    annotations: (measurements.annotations ?? []).map((annotation) => ({
      ...annotation,
      label: annotation.label ?? "Annotation",
      itemType: annotation.itemType ?? "glass",
      x: Number.isFinite(annotation.x) ? annotation.x : 0.1,
      y: Number.isFinite(annotation.y) ? annotation.y : 0.1,
      width: Number.isFinite(annotation.width) ? annotation.width : 0.2,
      height: Number.isFinite(annotation.height) ? annotation.height : 0.2,
      fields:
        annotation.itemType === "glass"
          ? {
              ...(annotation.fields ?? {}),
              physicalComponentMode: annotation.fields?.physicalComponentMode ?? "single_element",
              opticalSubElements: annotation.fields?.opticalSubElements ?? []
            }
          : (annotation.fields ?? {}),
      createdAt: annotation.createdAt ?? nowIso,
      updatedAt: annotation.updatedAt ?? nowIso
    })),
    updatedAt: measurements.updatedAt ?? nowIso
  };
}

export function getProjects(): LensProject[] {
  const projects = readJson<LensProject[]>(STORAGE_KEY);
  if (!projects || !Array.isArray(projects)) {
    const demo = createDemoProject();
    writeJson(STORAGE_KEY, [demo]);
    return [demo];
  }

  const valid = projects.filter(isLensProjectCandidate).map(normalizeProject);
  if (valid.length === 0) {
    const demo = createDemoProject();
    writeJson(STORAGE_KEY, [demo]);
    return [demo];
  }
  return valid.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function saveProjects(projects: LensProject[]): void {
  writeJson(STORAGE_KEY, projects.map(normalizeProject));
}

export function getProject(id: string): LensProject | undefined {
  return getProjects().find((project) => project.id === id);
}

export function saveProject(project: LensProject): LensProject {
  const now = new Date().toISOString();
  const normalized = normalizeProject({
    ...project,
    updatedAt: now
  });
  const projects = getProjects();
  const existingIndex = projects.findIndex((entry) => entry.id === normalized.id);
  if (existingIndex >= 0) {
    projects[existingIndex] = normalized;
  } else {
    projects.push(normalized);
  }
  saveProjects(projects);
  return normalized;
}

export function deleteProject(id: string): void {
  const projects = getProjects().filter((project) => project.id !== id);
  saveProjects(projects);
}

export function duplicateProject(id: string): LensProject | undefined {
  const project = getProject(id);
  if (!project) return undefined;

  const now = new Date().toISOString();
  const stackIdMap = new Map<string, string>();
  const duplicatedStackItems = project.stackItems.map((item, index) => {
    const newId = createId(item.type);
    stackIdMap.set(item.id, newId);
    return {
      ...item,
      id: newId,
      positionIndex: index
    };
  });
  const duplicated = normalizeProject({
    ...project,
    id: createId("project"),
    name: `${project.name} Copy`,
    createdAt: now,
    updatedAt: now,
    stackItems: duplicatedStackItems,
    mechanicalParts: (project.mechanicalParts ?? []).map((part) => ({
      ...part,
      id: createId("mech")
    })),
    experiments: project.experiments.map((experiment) => ({
      ...experiment,
      id: createId("experiment"),
      images: experiment.images.map((image) => ({ ...image, id: createId("image") }))
    })),
    measurements: {
      ...project.measurements,
      annotations: project.measurements.annotations.map((annotation) => ({
        ...annotation,
        id: createId("measure"),
        linkedStackItemId: annotation.linkedStackItemId
          ? stackIdMap.get(annotation.linkedStackItemId)
          : undefined,
        createdAt: now,
        updatedAt: now
      })),
      calibration: project.measurements.calibration
        ? {
            ...project.measurements.calibration,
            id: createId("cal"),
            createdAt: now
          }
        : undefined,
      updatedAt: now
    }
  });

  const projects = getProjects();
  projects.push(duplicated);
  saveProjects(projects);
  return duplicated;
}

export function downloadTextFile(filename: string, content: string): void {
  if (!hasWindow()) return;
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportProjectJson(project: LensProject): void {
  const fileName = `${safeFileName(project.name)}.json`;
  downloadTextFile(fileName, JSON.stringify(project, null, 2));
}

export function importProjectJson(raw: string): LensProject {
  const parsed = JSON.parse(raw) as unknown;
  if (!isLensProjectCandidate(parsed)) {
    throw new Error("Invalid project JSON format.");
  }

  const incoming = normalizeProject(parsed);
  const existing = getProjects();
  const conflict = existing.some((project) => project.id === incoming.id);
  if (!conflict) return incoming;

  return {
    ...incoming,
    id: createId("project"),
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    name: `${incoming.name} (Imported)`
  };
}

export function getGlobalCadDefaults(): CadDefaults {
  const settings = readJson<CadDefaults>(SETTINGS_KEY);
  return {
    ...defaultCadDefaults,
    ...(settings ?? {})
  };
}

export function saveGlobalCadDefaults(defaults: CadDefaults): void {
  writeJson(SETTINGS_KEY, defaults);
}

export function createEmptyProject(name: string): LensProject {
  const now = new Date().toISOString();
  return {
    id: createId("project"),
    name: name.trim(),
    notes: "",
    donorLens: "",
    targetLook: { ...defaultTargetLook },
    createdAt: now,
    updatedAt: now,
    stackItems: [],
    mechanicalParts: [],
    experiments: [],
    measurements: createEmptyMeasurementsState(now),
    focusTravel: defaultFocusTravelSetup(),
    cadDefaults: getGlobalCadDefaults()
  };
}
