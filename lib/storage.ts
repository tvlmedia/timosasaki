import { createDemoProject, createEmptyMeasurementsState, defaultCadDefaults, defaultTargetLook } from "@/lib/defaults";
import { createId, safeFileName } from "@/lib/ids";
import type { CadDefaults, LensProject, MeasurementsState } from "@/types";

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

export function normalizeProject(project: LensProject): LensProject {
  const now = new Date().toISOString();
  const normalizedMeasurements = normalizeMeasurements(project.measurements, now);

  return {
    ...project,
    notes: project.notes ?? "",
    targetLook: project.targetLook ?? { ...defaultTargetLook },
    cadDefaults: {
      ...defaultCadDefaults,
      ...(project.cadDefaults ?? {})
    },
    stackItems: [...(project.stackItems ?? [])]
      .map((item, index) => {
        const base = { ...item, positionIndex: index };
        if (base.type !== "glass") return base;
        return {
          ...base,
          physicalComponentMode: base.physicalComponentMode ?? "single_element",
          opticalSubElements: base.opticalSubElements ?? []
        };
      })
      .sort((a, b) => a.positionIndex - b.positionIndex),
    experiments: project.experiments ?? [],
    measurements: normalizedMeasurements,
    createdAt: project.createdAt ?? now,
    updatedAt: project.updatedAt ?? now
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
    experiments: [],
    measurements: createEmptyMeasurementsState(now),
    cadDefaults: getGlobalCadDefaults()
  };
}
