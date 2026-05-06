"use client";

import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { NumberInput } from "@/components/common/NumberInput";
import { Select } from "@/components/common/Select";
import { createId } from "@/lib/ids";
import type {
  CalibrationReferenceGeometry,
  CalibrationReferenceType,
  ElementOrientation,
  ElementOverallType,
  LensProject,
  MeasurementAnnotation,
  MeasurementFields,
  MeasurementItemType,
  OpticalGroupType,
  OpticalSubElement,
  OpticalPowerGuess,
  PhysicalComponentMode,
  StepDirection,
  SurfaceShape,
  StackItem
} from "@/types";

type DrawMode = "idle" | "annotation" | "calibration_line" | "calibration_box";

type Point = { x: number; y: number };
type BoxHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
type LineHandle = "start" | "end";

type EditTarget =
  | { kind: "annotation_box"; annotationId: string; handle: BoxHandle }
  | { kind: "calibration_draft_box"; handle: BoxHandle }
  | { kind: "calibration_saved_box"; handle: BoxHandle }
  | { kind: "calibration_draft_line"; handle: LineHandle }
  | { kind: "calibration_saved_line"; handle: LineHandle };

const measurementItemTypeOptions: Array<{ value: MeasurementItemType; label: string }> = [
  { value: "glass", label: "Glass Element" },
  { value: "spacer_ring", label: "Spacer / Air Gap Ring" },
  { value: "housing_barrel", label: "Housing / Barrel" },
  { value: "iris_disk", label: "Iris / Aperture Disk" },
  { value: "other", label: "Other" }
];

const calibrationReferenceTypeOptions: Array<{ value: CalibrationReferenceType; label: string }> = [
  { value: "housing_length", label: "Housing length" },
  { value: "caliper", label: "Caliper" },
  { value: "ruler", label: "Ruler" },
  { value: "known_ring", label: "Known ring" },
  { value: "printed_card", label: "Printed card" },
  { value: "other", label: "Other" }
];

const physicalComponentModeOptions: Array<{ value: PhysicalComponentMode; label: string }> = [
  { value: "single_element", label: "Single glass element" },
  { value: "optical_group", label: "Optical group / lens block" }
];

const opticalGroupTypeOptions: Array<{ value: OpticalGroupType; label: string }> = [
  { value: "cemented_doublet", label: "Cemented doublet" },
  { value: "cemented_triplet", label: "Cemented triplet" },
  { value: "air_spaced_group", label: "Air-spaced group" },
  { value: "fixed_rear_group", label: "Fixed rear group" },
  { value: "unknown_group", label: "Unknown group" }
];

const elementOverallTypeOptions: Array<{ value: ElementOverallType; label: string }> = [
  { value: "unknown", label: "Unknown / not sure" },
  { value: "biconvex", label: "Biconvex" },
  { value: "biconcave", label: "Biconcave" },
  { value: "plano_convex", label: "Plano-convex" },
  { value: "plano_concave", label: "Plano-concave" },
  { value: "positive_meniscus", label: "Positive meniscus" },
  { value: "negative_meniscus", label: "Negative meniscus" },
  { value: "cemented_interface_side", label: "Cemented interface side" },
  { value: "cemented_doublet", label: "Cemented doublet" },
  { value: "cemented_triplet", label: "Cemented triplet" },
  { value: "air_spaced_group", label: "Air-spaced group" },
  { value: "flat_filter_window", label: "Flat filter/window" },
  { value: "anamorphic_cylindrical", label: "Anamorphic/cylindrical element" },
  { value: "prism", label: "Prism" },
  { value: "mechanical_housing", label: "Mechanical housing" },
  { value: "spacer_ring", label: "Spacer ring" },
  { value: "iris_disk", label: "Iris disk" }
];

const surfaceShapeOptions: Array<{ value: SurfaceShape; label: string }> = [
  { value: "unknown", label: "Unknown" },
  { value: "convex", label: "Convex" },
  { value: "concave", label: "Concave" },
  { value: "flat", label: "Flat" },
  { value: "cylindrical_convex", label: "Cylindrical convex" },
  { value: "cylindrical_concave", label: "Cylindrical concave" },
  { value: "aspheric_or_complex", label: "Aspheric/complex" }
];

const opticalPowerGuessOptions: Array<{ value: OpticalPowerGuess; label: string }> = [
  { value: "unknown", label: "Unknown" },
  { value: "positive", label: "Positive" },
  { value: "negative", label: "Negative" },
  { value: "neutral_flat", label: "Neutral/flat" }
];

const orientationOptions: Array<{ value: ElementOrientation; label: string }> = [
  { value: "original_orientation", label: "Original orientation" },
  { value: "flipped", label: "Flipped" },
  { value: "front_side_marked", label: "Front side marked" },
  { value: "rear_side_marked", label: "Rear side marked" },
  { value: "unknown", label: "Unknown" }
];

const stepDirectionOptions: Array<{ value: StepDirection; label: string }> = [
  { value: "large_side_front", label: "Large side faces front" },
  { value: "large_side_rear", label: "Large side faces rear" },
  { value: "unknown", label: "Unknown" }
];

const annotationStrokeByType: Record<MeasurementItemType, string> = {
  glass: "#4aa3ff",
  spacer_ring: "#7a7a7a",
  housing_barrel: "#2dc57b",
  iris_disk: "#f5a437",
  other: "#d0d0d0"
};

const boxHandleDefs: Array<{
  handle: BoxHandle;
  tx: number;
  ty: number;
  cursor: string;
}> = [
  { handle: "nw", tx: 0, ty: 0, cursor: "nwse-resize" },
  { handle: "n", tx: 0.5, ty: 0, cursor: "ns-resize" },
  { handle: "ne", tx: 1, ty: 0, cursor: "nesw-resize" },
  { handle: "e", tx: 1, ty: 0.5, cursor: "ew-resize" },
  { handle: "se", tx: 1, ty: 1, cursor: "nwse-resize" },
  { handle: "s", tx: 0.5, ty: 1, cursor: "ns-resize" },
  { handle: "sw", tx: 0, ty: 1, cursor: "nesw-resize" },
  { handle: "w", tx: 0, ty: 0.5, cursor: "ew-resize" }
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeBox(start: Point, end: Point): { x: number; y: number; width: number; height: number } {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return {
    x: clamp01(x),
    y: clamp01(y),
    width: clamp01(width),
    height: clamp01(height)
  };
}

function boxToEdges(box: { x: number; y: number; width: number; height: number }): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} {
  return {
    x1: clamp01(box.x),
    y1: clamp01(box.y),
    x2: clamp01(box.x + box.width),
    y2: clamp01(box.y + box.height)
  };
}

function edgesToBox(
  edges: { x1: number; y1: number; x2: number; y2: number },
  minSize = 0.005
): { x: number; y: number; width: number; height: number } {
  let x1 = clamp01(Math.min(edges.x1, edges.x2));
  let y1 = clamp01(Math.min(edges.y1, edges.y2));
  let x2 = clamp01(Math.max(edges.x1, edges.x2));
  let y2 = clamp01(Math.max(edges.y1, edges.y2));

  if (x2 - x1 < minSize) {
    const center = (x1 + x2) / 2;
    x1 = clamp01(center - minSize / 2);
    x2 = clamp01(center + minSize / 2);
  }

  if (y2 - y1 < minSize) {
    const center = (y1 + y2) / 2;
    y1 = clamp01(center - minSize / 2);
    y2 = clamp01(center + minSize / 2);
  }

  return {
    x: x1,
    y: y1,
    width: Math.max(minSize, x2 - x1),
    height: Math.max(minSize, y2 - y1)
  };
}

function resizeBoxWithHandle(
  box: { x: number; y: number; width: number; height: number },
  handle: BoxHandle,
  point: Point
): { x: number; y: number; width: number; height: number } {
  const edges = boxToEdges(box);

  switch (handle) {
    case "nw":
      edges.x1 = point.x;
      edges.y1 = point.y;
      break;
    case "n":
      edges.y1 = point.y;
      break;
    case "ne":
      edges.x2 = point.x;
      edges.y1 = point.y;
      break;
    case "e":
      edges.x2 = point.x;
      break;
    case "se":
      edges.x2 = point.x;
      edges.y2 = point.y;
      break;
    case "s":
      edges.y2 = point.y;
      break;
    case "sw":
      edges.x1 = point.x;
      edges.y2 = point.y;
      break;
    case "w":
      edges.x1 = point.x;
      break;
    default:
      break;
  }

  return edgesToBox(edges);
}

function parseOptionalNumber(raw: string): number | undefined {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function formatMm(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function createDefaultOpticalSubElement(index: number): OpticalSubElement {
  return {
    id: createId("sub"),
    elementId: `E${index + 1}`,
    label: `Sub-element ${index + 1}`,
    role: "",
    elementOverallType: "unknown",
    frontSurfaceShape: "unknown",
    rearSurfaceShape: "unknown",
    opticalPowerGuess: "unknown",
    notes: ""
  };
}

function createGlassDefaultFields(index: number): MeasurementFields {
  return {
    elementId: `E${index + 1}`,
    role: "",
    physicalComponentMode: "single_element",
    groupType: "unknown_group",
    groupOpticalPowerGuess: "unknown",
    opticalSubElements: [],
    elementOverallType: "unknown",
    frontSurfaceShape: "unknown",
    rearSurfaceShape: "unknown",
    opticalPowerGuess: "unknown",
    orientation: "unknown",
    hasSteppedProfile: false,
    stepDirection: "unknown"
  };
}

function getDefaultFields(type: MeasurementItemType, countOfType: number): MeasurementFields {
  if (type === "glass") return createGlassDefaultFields(countOfType);
  if (type === "spacer_ring") {
    return {
      innerDiameterMm: 28,
      outerDiameterMm: 38,
      thicknessMm: 1,
      notes: "A physical ring/shim that sets the optical air gap between parts. The inner hole stays open for the light path."
    };
  }
  if (type === "housing_barrel") {
    return {
      innerDiameterMm: 40,
      outerDiameterMm: 44,
      lengthMm: 54.6
    };
  }
  if (type === "iris_disk") {
    return {
      diskDiameterMm: 30,
      apertureDiameterMm: 14,
      thicknessMm: 1.2
    };
  }
  return {};
}

function defaultAnnotationLabel(type: MeasurementItemType, countOfType: number): string {
  switch (type) {
    case "glass":
      return `E${countOfType + 1} element`;
    case "spacer_ring":
      return `Spacer / Air Gap Ring ${countOfType + 1}`;
    case "housing_barrel":
      return `Housing ${countOfType + 1}`;
    case "iris_disk":
      return `Iris disk ${countOfType + 1}`;
    default:
      return `Annotation ${countOfType + 1}`;
  }
}

function getElementTypeLabel(value: ElementOverallType | undefined): string {
  const hit = elementOverallTypeOptions.find((option) => option.value === value);
  return hit?.label ?? "unknown";
}

function getOpticalGroupTypeLabel(value: OpticalGroupType | undefined): string {
  const hit = opticalGroupTypeOptions.find((option) => option.value === value);
  return hit?.label ?? "Unknown group";
}

function getPhysicalMode(fields: MeasurementFields): PhysicalComponentMode {
  return fields.physicalComponentMode ?? "single_element";
}

function annotationDisplayLabel(annotation: MeasurementAnnotation): string {
  if (annotation.itemType !== "glass") return annotation.label;

  const mode = getPhysicalMode(annotation.fields);
  const elementId = (mode === "optical_group" ? annotation.fields.groupId : annotation.fields.elementId)?.trim()
    || annotation.label;
  const type =
    mode === "optical_group"
      ? getOpticalGroupTypeLabel(annotation.fields.groupType)
      : annotation.fields.elementOverallType && annotation.fields.elementOverallType !== "unknown"
        ? getElementTypeLabel(annotation.fields.elementOverallType)
        : "single glass element";
  const diameter = annotation.fields.diameterMm ? `Ø${formatMm(annotation.fields.diameterMm)}` : "";
  return [elementId, type, diameter].filter(Boolean).join(" — ");
}

function annotationSummary(annotation: MeasurementAnnotation): string {
  const fields = annotation.fields;
  if (annotation.itemType !== "glass") return "";

  const mode = getPhysicalMode(fields);
  const size = fields.diameterMm && fields.thicknessMm
    ? `Ø${formatMm(fields.diameterMm)} × ${formatMm(fields.thicknessMm)}mm`
    : "";

  if (mode === "optical_group") {
    const groupType = getOpticalGroupTypeLabel(fields.groupType);
    const count = fields.opticalSubElements?.length ?? 0;
    return [groupType, `${count} optical ${count === 1 ? "element" : "elements"}`, size ? `physical block ${size}` : ""]
      .filter(Boolean)
      .join(" · ");
  }

  const elementType =
    fields.elementOverallType && fields.elementOverallType !== "unknown"
      ? getElementTypeLabel(fields.elementOverallType)
      : "Unknown";
  return [elementType, "single glass element", size].filter(Boolean).join(" · ");
}

function lineDistancePixels(
  geometry: CalibrationReferenceGeometry,
  containerWidthPx: number,
  containerHeightPx: number
): number {
  if (geometry.referenceType === "line") {
    const dx = (geometry.x2 - geometry.x1) * containerWidthPx;
    const dy = (geometry.y2 - geometry.y1) * containerHeightPx;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const widthPx = geometry.width * containerWidthPx;
  const heightPx = geometry.height * containerHeightPx;
  return Math.max(widthPx, heightPx);
}

function normalizeStackPositions(items: StackItem[]): StackItem[] {
  return items.map((item, index) => ({ ...item, positionIndex: index }));
}

function mapAnnotationToStackItem(annotation: MeasurementAnnotation): StackItem | null {
  const fields = annotation.fields;
  const name = annotation.label.trim() || "Measured item";

  if (annotation.itemType === "glass") {
    if (!fields.diameterMm || fields.diameterMm <= 0 || !fields.thicknessMm || fields.thicknessMm <= 0) {
      return null;
    }

    const physicalComponentMode = getPhysicalMode(fields);
    const normalizedSubElements =
      physicalComponentMode === "optical_group"
        ? (fields.opticalSubElements ?? [])
            .map((entry, index) => ({
              id: entry.id || createId("sub"),
              elementId: entry.elementId?.trim() || undefined,
              label: entry.label?.trim() || `Sub-element ${index + 1}`,
              role: entry.role?.trim() || undefined,
              elementOverallType: entry.elementOverallType ?? "unknown",
              frontSurfaceShape: entry.frontSurfaceShape ?? "unknown",
              rearSurfaceShape: entry.rearSurfaceShape ?? "unknown",
              opticalPowerGuess: entry.opticalPowerGuess ?? "unknown",
              notes: entry.notes?.trim() || undefined
            }))
        : [];

    return {
      id: createId("glass"),
      type: "glass",
      opticalType: "GLASS",
      name,
      positionIndex: 0,
      diameterMm: fields.diameterMm,
      thicknessMm: fields.thicknessMm,
      edgeThicknessMm: fields.edgeThicknessMm,
      clearApertureMm: fields.clearApertureMm,
      flipped: fields.orientation === "flipped",
      physicalComponentMode,
      groupId: fields.groupId?.trim() || undefined,
      groupType: fields.groupType,
      groupOpticalPowerGuess: fields.groupOpticalPowerGuess,
      opticalSubElements: normalizedSubElements,
      elementId: fields.elementId,
      role: fields.role,
      elementOverallType: fields.elementOverallType,
      frontSurfaceShape: fields.frontSurfaceShape,
      rearSurfaceShape: fields.rearSurfaceShape,
      opticalPowerGuess: fields.opticalPowerGuess,
      orientation: fields.orientation,
      frontSideDescription: fields.frontSideDescription,
      rearSideDescription: fields.rearSideDescription,
      coatingColor: fields.coatingColor,
      condition: fields.condition,
      hasSteppedProfile: fields.hasSteppedProfile,
      largeDiameterMm: fields.largeDiameterMm,
      smallDiameterMm: fields.smallDiameterMm,
      largeSectionThicknessMm: fields.largeSectionThicknessMm,
      smallSectionThicknessMm: fields.smallSectionThicknessMm,
      stepDirection: fields.stepDirection,
      notes: fields.notes
    };
  }

  if (annotation.itemType === "spacer_ring") {
    if (
      !fields.innerDiameterMm ||
      !fields.outerDiameterMm ||
      !fields.thicknessMm ||
      fields.innerDiameterMm <= 0 ||
      fields.outerDiameterMm <= fields.innerDiameterMm ||
      fields.thicknessMm <= 0
    ) {
      return null;
    }

    return {
      id: createId("spacer"),
      type: "spacer",
      opticalType: "SPACER",
      name,
      positionIndex: 0,
      innerDiameterMm: fields.innerDiameterMm,
      outerDiameterMm: fields.outerDiameterMm,
      thicknessMm: fields.thicknessMm,
      autoFitToBarrel: false,
      hasAntiReflectionGrooves: false,
      chamferEnabled: false,
      chamferMm: 0.2,
      notes: fields.notes
    };
  }

  if (annotation.itemType === "housing_barrel") {
    if (
      !fields.innerDiameterMm ||
      !fields.outerDiameterMm ||
      !fields.lengthMm ||
      fields.innerDiameterMm <= 0 ||
      fields.outerDiameterMm <= fields.innerDiameterMm ||
      fields.lengthMm <= 0
    ) {
      return null;
    }

    return {
      id: createId("barrel"),
      type: "barrel",
      opticalType: "BARREL",
      name,
      positionIndex: 0,
      innerDiameterMm: fields.innerDiameterMm,
      outerDiameterMm: fields.outerDiameterMm,
      lengthMm: fields.lengthMm,
      notes: fields.notes
    };
  }

  if (annotation.itemType === "iris_disk") {
    if (
      !fields.diskDiameterMm ||
      !fields.apertureDiameterMm ||
      !fields.thicknessMm ||
      fields.diskDiameterMm <= 0 ||
      fields.apertureDiameterMm <= 0 ||
      fields.apertureDiameterMm > fields.diskDiameterMm ||
      fields.thicknessMm <= 0
    ) {
      return null;
    }

    return {
      id: createId("iris"),
      type: "iris",
      opticalType: "IRIS",
      name,
      positionIndex: 0,
      diskDiameterMm: fields.diskDiameterMm,
      apertureDiameterMm: fields.apertureDiameterMm,
      thicknessMm: fields.thicknessMm,
      isOval: false,
      notes: fields.notes
    };
  }

  return {
    id: createId("custom"),
    type: "custom",
    opticalType: "CUSTOM",
    name,
    positionIndex: 0,
    lengthMm: fields.lengthMm,
    diameterMm: fields.outerDiameterMm ?? fields.diameterMm,
    notes: fields.notes
  };
}

function SectionTitle({ children }: { children: string }) {
  return <h4 className="pt-2 text-xs font-semibold uppercase tracking-[0.14em] text-labMuted">{children}</h4>;
}

export function MeasurementsBoard({
  project,
  onProjectChange
}: {
  project: LensProject;
  onProjectChange: (project: LensProject) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const measurements = project.measurements;
  const annotations = measurements.annotations;

  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | undefined>(annotations[0]?.id);
  const [newAnnotationType, setNewAnnotationType] = useState<MeasurementItemType>("glass");
  const [drawMode, setDrawMode] = useState<DrawMode>("idle");
  const [drawingStart, setDrawingStart] = useState<Point | null>(null);
  const [drawingCurrent, setDrawingCurrent] = useState<Point | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  const [calibrationReferenceLabel, setCalibrationReferenceLabel] = useState("Housing length");
  const [calibrationKnownLengthMm, setCalibrationKnownLengthMm] = useState("");
  const [calibrationReferenceType, setCalibrationReferenceType] = useState<CalibrationReferenceType>("housing_length");
  const [calibrationDraftGeometry, setCalibrationDraftGeometry] = useState<CalibrationReferenceGeometry | null>(null);
  const [calibrationError, setCalibrationError] = useState("");
  const [syncError, setSyncError] = useState("");

  const selectedAnnotation = annotations.find((annotation) => annotation.id === selectedAnnotationId) ?? annotations[0];
  const selectedPhysicalMode =
    selectedAnnotation?.itemType === "glass" ? getPhysicalMode(selectedAnnotation.fields) : "single_element";
  const savedCalibrationGeometry = measurements.calibration?.geometry;
  const canEditGeometry = drawMode === "idle" && !drawingStart;

  useEffect(() => {
    if (!selectedAnnotationId && annotations[0]) {
      setSelectedAnnotationId(annotations[0].id);
      return;
    }
    if (selectedAnnotationId && !annotations.some((annotation) => annotation.id === selectedAnnotationId)) {
      setSelectedAnnotationId(annotations[0]?.id);
    }
  }, [annotations, selectedAnnotationId]);

  useEffect(() => {
    if (!measurements.calibration) return;
    setCalibrationReferenceLabel(measurements.calibration.referenceLabel || "Housing length");
    setCalibrationKnownLengthMm(String(measurements.calibration.knownLengthMm));
    setCalibrationReferenceType(measurements.calibration.referenceType);
  }, [measurements.calibration?.id]);

  const liveDraftBox = useMemo(() => {
    if (!drawingStart || !drawingCurrent) return null;
    return normalizeBox(drawingStart, drawingCurrent);
  }, [drawingStart, drawingCurrent]);

  const patchProject = (updater: (current: LensProject) => LensProject) => {
    onProjectChange({
      ...updater(project),
      updatedAt: new Date().toISOString()
    });
  };

  const patchMeasurements = (
    updater: (current: LensProject["measurements"]) => LensProject["measurements"]
  ) => {
    patchProject((currentProject) => ({
      ...currentProject,
      measurements: {
        ...updater(currentProject.measurements),
        updatedAt: new Date().toISOString()
      }
    }));
  };

  const updateSelectedAnnotation = (updater: (annotation: MeasurementAnnotation) => MeasurementAnnotation) => {
    if (!selectedAnnotation) return;
    patchMeasurements((current) => ({
      ...current,
      annotations: current.annotations.map((annotation) =>
        annotation.id === selectedAnnotation.id
          ? {
              ...updater(annotation),
              updatedAt: new Date().toISOString()
            }
          : annotation
      )
    }));
  };

  const updateSelectedField = <K extends keyof MeasurementFields>(key: K, value: MeasurementFields[K]) => {
    updateSelectedAnnotation((annotation) => ({
      ...annotation,
      fields: {
        ...annotation.fields,
        [key]: value
      }
    }));
  };

  const addOpticalSubElement = () => {
    if (!selectedAnnotation || selectedAnnotation.itemType !== "glass") return;
    const current = selectedAnnotation.fields.opticalSubElements ?? [];
    updateSelectedField("opticalSubElements", [...current, createDefaultOpticalSubElement(current.length)]);
  };

  const updateOpticalSubElement = <K extends keyof OpticalSubElement>(
    subId: string,
    key: K,
    value: OpticalSubElement[K]
  ) => {
    if (!selectedAnnotation || selectedAnnotation.itemType !== "glass") return;
    const current = selectedAnnotation.fields.opticalSubElements ?? [];
    updateSelectedField(
      "opticalSubElements",
      current.map((sub) => (sub.id === subId ? { ...sub, [key]: value } : sub))
    );
  };

  const removeOpticalSubElement = (subId: string) => {
    if (!selectedAnnotation || selectedAnnotation.itemType !== "glass") return;
    const current = selectedAnnotation.fields.opticalSubElements ?? [];
    updateSelectedField(
      "opticalSubElements",
      current.filter((sub) => sub.id !== subId)
    );
  };

  const moveOpticalSubElement = (subId: string, direction: -1 | 1) => {
    if (!selectedAnnotation || selectedAnnotation.itemType !== "glass") return;
    const current = [...(selectedAnnotation.fields.opticalSubElements ?? [])];
    const index = current.findIndex((sub) => sub.id === subId);
    if (index < 0) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= current.length) return;
    [current[index], current[nextIndex]] = [current[nextIndex], current[index]];
    updateSelectedField("opticalSubElements", current);
  };

  const updateAnnotationGeometry = (
    annotationId: string,
    box: { x: number; y: number; width: number; height: number }
  ) => {
    patchMeasurements((current) => ({
      ...current,
      annotations: current.annotations.map((annotation) =>
        annotation.id === annotationId
          ? {
              ...annotation,
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
              updatedAt: new Date().toISOString()
            }
          : annotation
      )
    }));
  };

  const updateCalibrationGeometry = (
    target: "draft" | "saved",
    geometry: CalibrationReferenceGeometry
  ) => {
    if (target === "draft") {
      setCalibrationDraftGeometry(geometry);
      return;
    }

    if (!measurements.calibration) return;

    const board = boardRef.current;
    const nextPixelsPerMm =
      board && measurements.calibration.knownLengthMm > 0
        ? lineDistancePixels(geometry, board.clientWidth, board.clientHeight) /
          measurements.calibration.knownLengthMm
        : measurements.calibration.pixelsPerMm;

    patchMeasurements((current) => {
      if (!current.calibration) return current;
      return {
        ...current,
        calibration: {
          ...current.calibration,
          geometry,
          pixelsPerMm: nextPixelsPerMm
        }
      };
    });
  };

  const toNormalizedPoint = (clientX: number, clientY: number): Point | null => {
    const board = boardRef.current;
    if (!board) return null;
    const rect = board.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height)
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!measurements.photoDataUrl) return;
    if (editTarget) return;
    if (drawMode === "idle") return;
    const point = toNormalizedPoint(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    setSyncError("");
    setCalibrationError("");
    setDrawingStart(point);
    setDrawingCurrent(point);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = toNormalizedPoint(event.clientX, event.clientY);
    if (!point) return;

    if (editTarget) {
      if (editTarget.kind === "annotation_box") {
        const annotation = annotations.find((entry) => entry.id === editTarget.annotationId);
        if (!annotation) return;
        const resized = resizeBoxWithHandle(
          { x: annotation.x, y: annotation.y, width: annotation.width, height: annotation.height },
          editTarget.handle,
          point
        );
        updateAnnotationGeometry(editTarget.annotationId, resized);
        return;
      }

      if (editTarget.kind === "calibration_draft_box" || editTarget.kind === "calibration_saved_box") {
        const source =
          editTarget.kind === "calibration_draft_box"
            ? calibrationDraftGeometry
            : measurements.calibration?.geometry;
        if (!source || source.referenceType !== "box") return;
        const resized = resizeBoxWithHandle(source, editTarget.handle, point);
        updateCalibrationGeometry(
          editTarget.kind === "calibration_draft_box" ? "draft" : "saved",
          { referenceType: "box", ...resized }
        );
        return;
      }

      if (editTarget.kind === "calibration_draft_line" || editTarget.kind === "calibration_saved_line") {
        const source =
          editTarget.kind === "calibration_draft_line"
            ? calibrationDraftGeometry
            : measurements.calibration?.geometry;
        if (!source || source.referenceType !== "line") return;
        const nextLine: CalibrationReferenceGeometry =
          editTarget.handle === "start"
            ? { ...source, x1: point.x, y1: point.y }
            : { ...source, x2: point.x, y2: point.y };
        updateCalibrationGeometry(
          editTarget.kind === "calibration_draft_line" ? "draft" : "saved",
          nextLine
        );
        return;
      }
    }

    if (!drawingStart) return;
    setDrawingCurrent(point);
  };

  const resetDrawing = () => {
    setDrawingStart(null);
    setDrawingCurrent(null);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (editTarget) {
      setEditTarget(null);
      return;
    }
    if (!drawingStart) return;
    const endPoint = toNormalizedPoint(event.clientX, event.clientY);
    const resolvedEnd = endPoint ?? drawingCurrent;

    if (!resolvedEnd) {
      resetDrawing();
      return;
    }

    if (drawMode === "annotation") {
      const box = normalizeBox(drawingStart, resolvedEnd);
      if (box.width < 0.01 || box.height < 0.01) {
        resetDrawing();
        return;
      }

      const countOfType = annotations.filter((annotation) => annotation.itemType === newAnnotationType).length;
      const now = new Date().toISOString();
      const annotation: MeasurementAnnotation = {
        id: createId("measure"),
        label: defaultAnnotationLabel(newAnnotationType, countOfType),
        itemType: newAnnotationType,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        fields: getDefaultFields(newAnnotationType, countOfType),
        createdAt: now,
        updatedAt: now
      };

      patchMeasurements((current) => ({
        ...current,
        annotations: [...current.annotations, annotation]
      }));
      setSelectedAnnotationId(annotation.id);
    }

    if (drawMode === "calibration_line") {
      const line: CalibrationReferenceGeometry = {
        referenceType: "line",
        x1: drawingStart.x,
        y1: drawingStart.y,
        x2: resolvedEnd.x,
        y2: resolvedEnd.y
      };
      setCalibrationDraftGeometry(line);
      setDrawMode("idle");
    }

    if (drawMode === "calibration_box") {
      const box = normalizeBox(drawingStart, resolvedEnd);
      if (box.width >= 0.005 && box.height >= 0.005) {
        setCalibrationDraftGeometry({
          referenceType: "box",
          ...box
        });
        setDrawMode("idle");
      }
    }

    resetDrawing();
  };

  const handleEditPointerDown = (
    event: ReactPointerEvent<SVGElement>,
    target: EditTarget
  ) => {
    if (!measurements.photoDataUrl) return;
    event.preventDefault();
    event.stopPropagation();
    setDrawMode("idle");
    setEditTarget(target);
  };

  const handleUploadPhoto = async (file?: File) => {
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Failed to read image file."));
      reader.readAsDataURL(file);
    });

    patchMeasurements((current) => ({
      ...current,
      photoDataUrl: dataUrl,
      photoName: file.name,
      photoUpdatedAt: new Date().toISOString()
    }));
  };

  const saveCalibration = () => {
    if (!calibrationDraftGeometry) {
      setCalibrationError("Draw a calibration line or box first.");
      return;
    }

    const knownLengthMm = parseOptionalNumber(calibrationKnownLengthMm);
    if (knownLengthMm === undefined || knownLengthMm <= 0) {
      setCalibrationError("Known length must be a positive number.");
      return;
    }

    const board = boardRef.current;
    if (!board) {
      setCalibrationError("Photo board is not ready yet.");
      return;
    }

    const pxLength = lineDistancePixels(calibrationDraftGeometry, board.clientWidth, board.clientHeight);
    if (!Number.isFinite(pxLength) || pxLength <= 0.5) {
      setCalibrationError("Calibration selection is too small. Draw a longer line/box.");
      return;
    }

    const calibration = {
      id: createId("cal"),
      referenceLabel: calibrationReferenceLabel.trim() || "Housing length",
      knownLengthMm,
      referenceType: calibrationReferenceType,
      geometry: calibrationDraftGeometry,
      pixelsPerMm: pxLength / knownLengthMm,
      createdAt: new Date().toISOString()
    };

    patchMeasurements((current) => ({
      ...current,
      calibration
    }));

    setCalibrationError("");
    setCalibrationDraftGeometry(null);
  };

  const deleteSelectedAnnotation = () => {
    if (!selectedAnnotation) return;
    patchMeasurements((current) => ({
      ...current,
      annotations: current.annotations.filter((annotation) => annotation.id !== selectedAnnotation.id)
    }));
  };

  const createOrSyncStackItem = () => {
    if (!selectedAnnotation) return;
    const mapped = mapAnnotationToStackItem(selectedAnnotation);

    if (!mapped) {
      setSyncError(
        "Missing required fields for this annotation type. Check diameters/thickness/aperture values before syncing to stack."
      );
      return;
    }

    const currentItems = normalizeStackPositions(project.stackItems);
    const linkedId = selectedAnnotation.linkedStackItemId;
    const linkedIndex = linkedId ? currentItems.findIndex((item) => item.id === linkedId) : -1;

    let nextItems = currentItems;
    let finalLinkedId = linkedId;

    if (linkedIndex >= 0 && currentItems[linkedIndex].type === mapped.type) {
      const existing = currentItems[linkedIndex];
      nextItems = currentItems.map((item, index) =>
        index === linkedIndex
          ? {
              ...mapped,
              id: existing.id,
              locked: existing.locked,
              positionIndex: existing.positionIndex
            }
          : item
      );
      finalLinkedId = existing.id;
    } else {
      const appended = {
        ...mapped,
        positionIndex: currentItems.length
      };
      nextItems = [...currentItems, appended];
      finalLinkedId = appended.id;
    }

    const normalized = normalizeStackPositions(nextItems);

    patchProject((currentProject) => ({
      ...currentProject,
      stackItems: normalized,
      measurements: {
        ...currentProject.measurements,
        annotations: currentProject.measurements.annotations.map((annotation) =>
          annotation.id === selectedAnnotation.id
            ? {
                ...annotation,
                linkedStackItemId: finalLinkedId,
                updatedAt: new Date().toISOString()
              }
            : annotation
        ),
        updatedAt: new Date().toISOString()
      }
    }));

    setSyncError("");
  };

  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-labMuted">Measurements Workflow</h3>
        <p className="mt-2 text-sm text-labMuted">
          Visual exploded lens map with approximate photo scale. Final CAD-critical dimensions should still come from
          calipers.
        </p>
      </section>

      <section className="panel space-y-4 p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
          <div className="rounded-xl border border-labBorder bg-[#0b0b0b] p-3">
            <p className="text-sm text-labText">Photo</p>
            <p className="mt-1 text-xs text-labMuted">
              Upload donor housing + loose elements layout. Large images can fill localStorage quickly.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button onClick={() => fileInputRef.current?.click()}>Upload Photo</Button>
              {measurements.photoName && <span className="text-xs text-labMuted">{measurements.photoName}</span>}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                void handleUploadPhoto(file);
                event.target.value = "";
              }}
            />
          </div>

          <div className="rounded-xl border border-labBorder bg-[#0b0b0b] p-3">
            <p className="text-sm text-labText">Annotations</p>
            <Select
              label="Item type"
              value={newAnnotationType}
              onChange={(event) => setNewAnnotationType(event.target.value as MeasurementItemType)}
            >
              {measurementItemTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Button
              className="mt-2 w-full"
              variant={drawMode === "annotation" ? "primary" : "secondary"}
              onClick={() => setDrawMode((mode) => (mode === "annotation" ? "idle" : "annotation"))}
            >
              {drawMode === "annotation" ? "Cancel Draw" : "Draw Annotation Box"}
            </Button>
          </div>

          <div className="rounded-xl border border-labBorder bg-[#0b0b0b] p-3">
            <p className="text-sm text-labText">Calibrate Scale</p>
            <p className="mt-1 text-xs leading-relaxed text-labMuted">
              Use the measured total housing length as an approximate photo scale. Final CAD-critical element
              dimensions should still be entered from caliper measurements.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                variant={drawMode === "calibration_line" ? "primary" : "secondary"}
                onClick={() => {
                  setDrawMode((mode) => (mode === "calibration_line" ? "idle" : "calibration_line"));
                  setCalibrationDraftGeometry(null);
                }}
                className="text-xs"
              >
                Draw line
              </Button>
              <Button
                variant={drawMode === "calibration_box" ? "primary" : "secondary"}
                onClick={() => {
                  setDrawMode((mode) => (mode === "calibration_box" ? "idle" : "calibration_box"));
                  setCalibrationDraftGeometry(null);
                }}
                className="text-xs"
              >
                Draw box
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <div
              ref={boardRef}
              className="relative overflow-hidden rounded-xl border border-labBorder bg-[#070707]"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={() => {
                if (drawingStart) resetDrawing();
                if (editTarget) setEditTarget(null);
              }}
            >
              {!measurements.photoDataUrl && (
                <div className="flex h-[420px] items-center justify-center px-4 text-center text-sm text-labMuted">
                  Upload a donor lens photo to start calibration and annotations.
                </div>
              )}

              {measurements.photoDataUrl && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={measurements.photoDataUrl}
                    alt="Donor lens measurements"
                    className="block h-auto w-full select-none"
                    draggable={false}
                  />

                  <svg className="absolute inset-0 h-full w-full">
                    {measurements.calibration && (
                      <g>
                        {measurements.calibration.geometry.referenceType === "line" ? (
                          <line
                            x1={`${measurements.calibration.geometry.x1 * 100}%`}
                            y1={`${measurements.calibration.geometry.y1 * 100}%`}
                            x2={`${measurements.calibration.geometry.x2 * 100}%`}
                            y2={`${measurements.calibration.geometry.y2 * 100}%`}
                            stroke="#ffcc66"
                            strokeWidth={2.2}
                            className="pointer-events-none"
                          />
                        ) : (
                          <rect
                            x={`${measurements.calibration.geometry.x * 100}%`}
                            y={`${measurements.calibration.geometry.y * 100}%`}
                            width={`${measurements.calibration.geometry.width * 100}%`}
                            height={`${measurements.calibration.geometry.height * 100}%`}
                            fill="rgba(255, 204, 102, 0.12)"
                            stroke="#ffcc66"
                            strokeWidth={2}
                            className="pointer-events-none"
                          />
                        )}
                        <text
                          x={`${(measurements.calibration.geometry.referenceType === "line"
                            ? measurements.calibration.geometry.x1
                            : measurements.calibration.geometry.x) * 100}%`}
                          y={`${(measurements.calibration.geometry.referenceType === "line"
                            ? measurements.calibration.geometry.y1
                            : measurements.calibration.geometry.y) * 100 - 1}%`}
                          fill="#ffcc66"
                          fontSize="11"
                          className="pointer-events-none"
                        >
                          {`${measurements.calibration.referenceLabel}: ${formatMm(
                            measurements.calibration.knownLengthMm
                          )}mm`}
                        </text>

                        {canEditGeometry &&
                          savedCalibrationGeometry?.referenceType === "line" &&
                          ([
                            {
                              key: "start" as const,
                              x: savedCalibrationGeometry.x1,
                              y: savedCalibrationGeometry.y1
                            },
                            {
                              key: "end" as const,
                              x: savedCalibrationGeometry.x2,
                              y: savedCalibrationGeometry.y2
                            }
                          ]).map((point) => (
                            <circle
                              key={`saved-cal-line-${point.key}`}
                              cx={`${point.x * 100}%`}
                              cy={`${point.y * 100}%`}
                              r={6}
                              fill="#ffcc66"
                              stroke="#1a1a1a"
                              strokeWidth={1.1}
                              className="pointer-events-auto cursor-move"
                              onPointerDown={(event) =>
                                handleEditPointerDown(event, {
                                  kind: "calibration_saved_line",
                                  handle: point.key
                                })
                              }
                            />
                          ))}

                        {canEditGeometry &&
                          savedCalibrationGeometry?.referenceType === "box" &&
                          boxHandleDefs.map((handle) => (
                            <circle
                              key={`saved-cal-box-${handle.handle}`}
                              cx={`${(savedCalibrationGeometry.x + savedCalibrationGeometry.width * handle.tx) * 100}%`}
                              cy={`${(savedCalibrationGeometry.y + savedCalibrationGeometry.height * handle.ty) * 100}%`}
                              r={5}
                              fill="#ffcc66"
                              stroke="#1a1a1a"
                              strokeWidth={1}
                              style={{ cursor: handle.cursor }}
                              className="pointer-events-auto"
                              onPointerDown={(event) =>
                                handleEditPointerDown(event, {
                                  kind: "calibration_saved_box",
                                  handle: handle.handle
                                })
                              }
                            />
                          ))}
                      </g>
                    )}

                    {annotations.map((annotation) => {
                      const selected = annotation.id === selectedAnnotation?.id;
                      const stroke = selected ? "#37a3ff" : annotationStrokeByType[annotation.itemType];
                      return (
                        <g key={annotation.id}>
                          <rect
                            x={`${annotation.x * 100}%`}
                            y={`${annotation.y * 100}%`}
                            width={`${annotation.width * 100}%`}
                            height={`${annotation.height * 100}%`}
                            fill={selected ? "rgba(55, 163, 255, 0.10)" : "rgba(5, 5, 5, 0.15)"}
                            stroke={stroke}
                            strokeWidth={selected ? 2.2 : 1.6}
                            className="pointer-events-auto cursor-pointer"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (drawMode === "idle") setSelectedAnnotationId(annotation.id);
                            }}
                          />
                          {selected &&
                            canEditGeometry &&
                            boxHandleDefs.map((handle) => (
                              <circle
                                key={`${annotation.id}-${handle.handle}`}
                                cx={`${(annotation.x + annotation.width * handle.tx) * 100}%`}
                                cy={`${(annotation.y + annotation.height * handle.ty) * 100}%`}
                                r={5}
                                fill="#37a3ff"
                                stroke="#1a1a1a"
                                strokeWidth={1}
                                style={{ cursor: handle.cursor }}
                                className="pointer-events-auto"
                                onPointerDown={(event) =>
                                  handleEditPointerDown(event, {
                                    kind: "annotation_box",
                                    annotationId: annotation.id,
                                    handle: handle.handle
                                  })
                                }
                              />
                            ))}
                          <text
                            x={`${annotation.x * 100 + 0.5}%`}
                            y={`${annotation.y * 100 + 2.4}%`}
                            fill="#f5f5f5"
                            fontSize="10.5"
                            className="pointer-events-none"
                          >
                            {annotationDisplayLabel(annotation)}
                          </text>
                        </g>
                      );
                    })}

                    {drawMode === "annotation" && liveDraftBox && (
                      <rect
                        x={`${liveDraftBox.x * 100}%`}
                        y={`${liveDraftBox.y * 100}%`}
                        width={`${liveDraftBox.width * 100}%`}
                        height={`${liveDraftBox.height * 100}%`}
                        fill="rgba(55, 163, 255, 0.10)"
                        stroke="#37a3ff"
                        strokeDasharray="4 3"
                        strokeWidth={1.5}
                      />
                    )}

                    {(drawMode === "calibration_line" || drawMode === "calibration_box") &&
                      drawingStart &&
                      drawingCurrent &&
                      (drawMode === "calibration_line" ? (
                        <line
                          x1={`${drawingStart.x * 100}%`}
                          y1={`${drawingStart.y * 100}%`}
                          x2={`${drawingCurrent.x * 100}%`}
                          y2={`${drawingCurrent.y * 100}%`}
                          stroke="#ffcc66"
                          strokeWidth={2}
                          strokeDasharray="5 4"
                        />
                      ) : (
                        liveDraftBox && (
                          <rect
                            x={`${liveDraftBox.x * 100}%`}
                            y={`${liveDraftBox.y * 100}%`}
                            width={`${liveDraftBox.width * 100}%`}
                            height={`${liveDraftBox.height * 100}%`}
                            fill="rgba(255, 204, 102, 0.1)"
                            stroke="#ffcc66"
                            strokeWidth={2}
                            strokeDasharray="5 4"
                          />
                        )
                      ))}

                    {calibrationDraftGeometry && (
                      <g>
                        {calibrationDraftGeometry.referenceType === "line" ? (
                          <>
                            <line
                              x1={`${calibrationDraftGeometry.x1 * 100}%`}
                              y1={`${calibrationDraftGeometry.y1 * 100}%`}
                              x2={`${calibrationDraftGeometry.x2 * 100}%`}
                              y2={`${calibrationDraftGeometry.y2 * 100}%`}
                              stroke="#ffcc66"
                              strokeWidth={2}
                            />
                            {canEditGeometry &&
                              ([
                                {
                                  key: "start" as const,
                                  x: calibrationDraftGeometry.x1,
                                  y: calibrationDraftGeometry.y1
                                },
                                {
                                  key: "end" as const,
                                  x: calibrationDraftGeometry.x2,
                                  y: calibrationDraftGeometry.y2
                                }
                              ]).map((point) => (
                                <circle
                                  key={`draft-cal-line-${point.key}`}
                                  cx={`${point.x * 100}%`}
                                  cy={`${point.y * 100}%`}
                                  r={6}
                                  fill="#ffcc66"
                                  stroke="#1a1a1a"
                                  strokeWidth={1.1}
                                  className="pointer-events-auto cursor-move"
                                  onPointerDown={(event) =>
                                    handleEditPointerDown(event, {
                                      kind: "calibration_draft_line",
                                      handle: point.key
                                    })
                                  }
                                />
                              ))}
                          </>
                        ) : (
                          <>
                            <rect
                              x={`${calibrationDraftGeometry.x * 100}%`}
                              y={`${calibrationDraftGeometry.y * 100}%`}
                              width={`${calibrationDraftGeometry.width * 100}%`}
                              height={`${calibrationDraftGeometry.height * 100}%`}
                              fill="rgba(255, 204, 102, 0.1)"
                              stroke="#ffcc66"
                              strokeWidth={2}
                            />
                            {canEditGeometry &&
                              boxHandleDefs.map((handle) => (
                                <circle
                                  key={`draft-cal-box-${handle.handle}`}
                                  cx={`${(calibrationDraftGeometry.x + calibrationDraftGeometry.width * handle.tx) * 100}%`}
                                  cy={`${(calibrationDraftGeometry.y + calibrationDraftGeometry.height * handle.ty) * 100}%`}
                                  r={5}
                                  fill="#ffcc66"
                                  stroke="#1a1a1a"
                                  strokeWidth={1}
                                  style={{ cursor: handle.cursor }}
                                  className="pointer-events-auto"
                                  onPointerDown={(event) =>
                                    handleEditPointerDown(event, {
                                      kind: "calibration_draft_box",
                                      handle: handle.handle
                                    })
                                  }
                                />
                              ))}
                          </>
                        )}
                      </g>
                    )}
                  </svg>
                </>
              )}
            </div>
            <p className="text-xs text-labMuted">
              Tip: select an annotation and drag the blue handles to resize. Drag yellow handles on calibration
              line/box to fine-tune scale references.
            </p>

            <div className="rounded-xl border border-labBorder bg-[#0b0b0b] p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-labText">Calibration</p>
                {measurements.calibration && (
                  <Button
                    variant="ghost"
                    className="text-xs"
                    onClick={() => patchMeasurements((current) => ({ ...current, calibration: undefined }))}
                  >
                    Clear calibration
                  </Button>
                )}
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <Input
                  label="Reference label"
                  value={calibrationReferenceLabel}
                  onChange={(event) => setCalibrationReferenceLabel(event.target.value)}
                />
                <NumberInput
                  label="Known length (mm)"
                  value={calibrationKnownLengthMm}
                  min={0}
                  onChange={(event) => setCalibrationKnownLengthMm(event.target.value)}
                />
                <Select
                  label="Reference type"
                  value={calibrationReferenceType}
                  onChange={(event) => setCalibrationReferenceType(event.target.value as CalibrationReferenceType)}
                >
                  {calibrationReferenceTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="mt-2 flex gap-2">
                <Button onClick={saveCalibration}>Save Calibration</Button>
                <Button variant="ghost" onClick={() => setCalibrationDraftGeometry(null)}>
                  Clear Draft
                </Button>
              </div>

              {calibrationError && <p className="mt-2 text-sm text-labDanger">{calibrationError}</p>}

              {measurements.calibration && (
                <>
                  <p className="mt-3 text-sm text-labText">
                    Approx scale: <span className="mono">{measurements.calibration.pixelsPerMm.toFixed(3)} px/mm</span>{" "}
                    based on <span className="mono">{measurements.calibration.referenceLabel}</span> ={" "}
                    <span className="mono">{formatMm(measurements.calibration.knownLengthMm)}mm</span>
                  </p>
                  <p className="mt-1 text-xs text-labWarning">
                    Approximate photo scale only. Use caliper values for final CAD.
                  </p>
                </>
              )}
            </div>

            <div className="rounded-xl border border-labBorder bg-[#0b0b0b] p-3">
              <p className="mb-2 text-sm font-semibold text-labText">Annotations</p>
              <div className="grid gap-2 md:grid-cols-2">
                {annotations.length === 0 && (
                  <p className="text-sm text-labMuted">No annotations yet. Draw a box to create one.</p>
                )}
                {annotations.map((annotation) => (
                  <button
                    key={annotation.id}
                    type="button"
                    className={`rounded-lg border p-2 text-left transition ${
                      annotation.id === selectedAnnotation?.id
                        ? "border-labAccent bg-[#0d1d2c]"
                        : "border-labBorder bg-[#090909] hover:border-[#3a3a3a]"
                    }`}
                    onClick={() => {
                      setDrawMode("idle");
                      setSelectedAnnotationId(annotation.id);
                    }}
                  >
                    <p className="text-sm text-labText">{annotationDisplayLabel(annotation)}</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-labMuted">
                      {measurementItemTypeOptions.find((option) => option.value === annotation.itemType)?.label}
                    </p>
                    {annotationSummary(annotation) && (
                      <p className="mt-1 text-xs text-labMuted">{annotationSummary(annotation)}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <aside className="panel max-h-[88vh] space-y-3 overflow-y-auto p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-labMuted">Annotation Editor</h3>
            {!selectedAnnotation && <p className="text-sm text-labMuted">Select an annotation to edit.</p>}

            {selectedAnnotation && (
              <div className="space-y-3">
                <Input
                  label="Label"
                  value={selectedAnnotation.label}
                  onChange={(event) =>
                    updateSelectedAnnotation((annotation) => ({
                      ...annotation,
                      label: event.target.value
                    }))
                  }
                />

                <Select
                  label="Item type"
                  value={selectedAnnotation.itemType}
                  onChange={(event) => {
                    const nextType = event.target.value as MeasurementItemType;
                    updateSelectedAnnotation((annotation) => ({
                      ...annotation,
                      itemType: nextType
                    }));
                  }}
                >
                  {measurementItemTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>

                {selectedAnnotation.itemType === "glass" && (
                  <>
                    <SectionTitle>Physical Component</SectionTitle>
                    <Select
                      label="Mode"
                      value={selectedPhysicalMode}
                      onChange={(event) => {
                        const mode = event.target.value as PhysicalComponentMode;
                        updateSelectedAnnotation((annotation) => ({
                          ...annotation,
                          fields: {
                            ...annotation.fields,
                            physicalComponentMode: mode,
                            groupType: annotation.fields.groupType ?? "unknown_group",
                            groupOpticalPowerGuess: annotation.fields.groupOpticalPowerGuess ?? "unknown",
                            opticalSubElements: annotation.fields.opticalSubElements ?? []
                          }
                        }));
                      }}
                    >
                      {physicalComponentModeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                    <p className="text-xs text-labMuted">
                      Use Optical Group / Lens Block when multiple glass elements are glued, cemented, or mechanically
                      fixed together and should be handled as one physical part in the stack.
                    </p>

                    {selectedPhysicalMode === "single_element" ? (
                      <>
                        <SectionTitle>Identity</SectionTitle>
                        <Input
                          label="Element ID"
                          value={selectedAnnotation.fields.elementId ?? ""}
                          onChange={(event) => updateSelectedField("elementId", event.target.value)}
                        />
                        <Input
                          label="Role"
                          value={selectedAnnotation.fields.role ?? ""}
                          onChange={(event) => updateSelectedField("role", event.target.value)}
                        />

                        <SectionTitle>Caliper Measurements</SectionTitle>
                        <NumberInput
                          label="Diameter (mm)"
                          value={selectedAnnotation.fields.diameterMm ?? ""}
                          min={0}
                          onChange={(event) => updateSelectedField("diameterMm", parseOptionalNumber(event.target.value))}
                        />
                        <NumberInput
                          label="Thickness (mm)"
                          value={selectedAnnotation.fields.thicknessMm ?? ""}
                          min={0}
                          onChange={(event) => updateSelectedField("thicknessMm", parseOptionalNumber(event.target.value))}
                        />
                        <NumberInput
                          label="Edge thickness (mm)"
                          value={selectedAnnotation.fields.edgeThicknessMm ?? ""}
                          min={0}
                          onChange={(event) =>
                            updateSelectedField("edgeThicknessMm", parseOptionalNumber(event.target.value))
                          }
                        />
                        <NumberInput
                          label="Clear aperture / usable optical diameter (mm)"
                          value={selectedAnnotation.fields.clearApertureMm ?? ""}
                          min={0}
                          onChange={(event) =>
                            updateSelectedField("clearApertureMm", parseOptionalNumber(event.target.value))
                          }
                        />
                        <p className="text-xs text-labMuted">
                          Optional. Leave empty if unknown. This is the usable optical diameter, not the physical
                          glass diameter. Used for vignetting and retaining-lip warnings.
                        </p>

                        <SectionTitle>Optical Description</SectionTitle>
                        <Select
                          label="Overall element type"
                          value={selectedAnnotation.fields.elementOverallType ?? "unknown"}
                          onChange={(event) =>
                            updateSelectedField("elementOverallType", event.target.value as ElementOverallType)
                          }
                        >
                          {elementOverallTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                        <Select
                          label="Front surface shape"
                          value={selectedAnnotation.fields.frontSurfaceShape ?? "unknown"}
                          onChange={(event) => updateSelectedField("frontSurfaceShape", event.target.value as SurfaceShape)}
                        >
                          {surfaceShapeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                        <Select
                          label="Rear surface shape"
                          value={selectedAnnotation.fields.rearSurfaceShape ?? "unknown"}
                          onChange={(event) => updateSelectedField("rearSurfaceShape", event.target.value as SurfaceShape)}
                        >
                          {surfaceShapeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                        <Select
                          label="Optical power guess"
                          value={selectedAnnotation.fields.opticalPowerGuess ?? "unknown"}
                          onChange={(event) =>
                            updateSelectedField("opticalPowerGuess", event.target.value as OpticalPowerGuess)
                          }
                        >
                          {opticalPowerGuessOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </>
                    ) : (
                      <>
                        <SectionTitle>Group Identity</SectionTitle>
                        <Input
                          label="Group ID"
                          value={selectedAnnotation.fields.groupId ?? ""}
                          onChange={(event) => updateSelectedField("groupId", event.target.value)}
                          placeholder="E2/E3"
                        />
                        <Input
                          label="Role"
                          value={selectedAnnotation.fields.role ?? ""}
                          onChange={(event) => updateSelectedField("role", event.target.value)}
                          placeholder="middle group"
                        />
                        <Select
                          label="Group type"
                          value={selectedAnnotation.fields.groupType ?? "unknown_group"}
                          onChange={(event) =>
                            updateSelectedField("groupType", event.target.value as OpticalGroupType)
                          }
                        >
                          {opticalGroupTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>

                        <SectionTitle>Physical Measurements</SectionTitle>
                        <NumberInput
                          label="Physical diameter (mm)"
                          value={selectedAnnotation.fields.diameterMm ?? ""}
                          min={0}
                          onChange={(event) => updateSelectedField("diameterMm", parseOptionalNumber(event.target.value))}
                        />
                        <NumberInput
                          label="Physical thickness (mm)"
                          value={selectedAnnotation.fields.thicknessMm ?? ""}
                          min={0}
                          onChange={(event) => updateSelectedField("thicknessMm", parseOptionalNumber(event.target.value))}
                        />
                        <NumberInput
                          label="Clear aperture / usable optical diameter (mm)"
                          value={selectedAnnotation.fields.clearApertureMm ?? ""}
                          min={0}
                          onChange={(event) =>
                            updateSelectedField("clearApertureMm", parseOptionalNumber(event.target.value))
                          }
                        />
                        <p className="text-xs text-labMuted">
                          Optional. Leave empty if unknown. This is the usable optical diameter, not the physical
                          glass diameter. Used for vignetting and retaining-lip warnings.
                        </p>
                        <Select
                          label="Group optical power guess"
                          value={selectedAnnotation.fields.groupOpticalPowerGuess ?? "unknown"}
                          onChange={(event) =>
                            updateSelectedField("groupOpticalPowerGuess", event.target.value as OpticalPowerGuess)
                          }
                        >
                          {opticalPowerGuessOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>

                        <SectionTitle>Optical Sub-elements</SectionTitle>
                        <p className="text-xs text-labMuted">
                          These are documentation-only optical parts inside this physical block.
                        </p>
                        <div className="grid gap-2">
                          {(selectedAnnotation.fields.opticalSubElements ?? []).map((subElement, subIndex) => (
                            <div key={subElement.id} className="rounded-xl border border-labBorder bg-[#0a0a0a] p-3">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-labMuted">
                                  Sub-element {subIndex + 1}
                                </p>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    className="px-2 py-1 text-[11px]"
                                    onClick={() => moveOpticalSubElement(subElement.id, -1)}
                                    disabled={subIndex === 0}
                                  >
                                    Up
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    className="px-2 py-1 text-[11px]"
                                    onClick={() => moveOpticalSubElement(subElement.id, 1)}
                                    disabled={subIndex === (selectedAnnotation.fields.opticalSubElements ?? []).length - 1}
                                  >
                                    Down
                                  </Button>
                                  <Button
                                    variant="danger"
                                    className="px-2 py-1 text-[11px]"
                                    onClick={() => removeOpticalSubElement(subElement.id)}
                                  >
                                    Delete
                                  </Button>
                                </div>
                              </div>

                              <Input
                                label="Element ID"
                                value={subElement.elementId ?? ""}
                                onChange={(event) => updateOpticalSubElement(subElement.id, "elementId", event.target.value)}
                                placeholder="E2"
                              />
                              <Input
                                label="Label"
                                value={subElement.label}
                                onChange={(event) => updateOpticalSubElement(subElement.id, "label", event.target.value)}
                              />
                              <Input
                                label="Role"
                                value={subElement.role ?? ""}
                                onChange={(event) => updateOpticalSubElement(subElement.id, "role", event.target.value)}
                              />
                              <Select
                                label="Overall element type"
                                value={subElement.elementOverallType ?? "unknown"}
                                onChange={(event) =>
                                  updateOpticalSubElement(
                                    subElement.id,
                                    "elementOverallType",
                                    event.target.value as ElementOverallType
                                  )
                                }
                              >
                                {elementOverallTypeOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </Select>
                              <Select
                                label="Front surface shape"
                                value={subElement.frontSurfaceShape ?? "unknown"}
                                onChange={(event) =>
                                  updateOpticalSubElement(
                                    subElement.id,
                                    "frontSurfaceShape",
                                    event.target.value as SurfaceShape
                                  )
                                }
                              >
                                {surfaceShapeOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </Select>
                              <Select
                                label="Rear surface shape"
                                value={subElement.rearSurfaceShape ?? "unknown"}
                                onChange={(event) =>
                                  updateOpticalSubElement(
                                    subElement.id,
                                    "rearSurfaceShape",
                                    event.target.value as SurfaceShape
                                  )
                                }
                              >
                                {surfaceShapeOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </Select>
                              <Select
                                label="Optical power guess"
                                value={subElement.opticalPowerGuess ?? "unknown"}
                                onChange={(event) =>
                                  updateOpticalSubElement(
                                    subElement.id,
                                    "opticalPowerGuess",
                                    event.target.value as OpticalPowerGuess
                                  )
                                }
                              >
                                {opticalPowerGuessOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </Select>
                              <label className="mt-2 flex flex-col gap-1 text-sm text-labMuted">
                                <span>Notes</span>
                                <textarea
                                  className="min-h-16 rounded-xl border border-labBorder bg-[#090909] px-3 py-2 text-labText outline-none focus:border-labAccent"
                                  value={subElement.notes ?? ""}
                                  onChange={(event) => updateOpticalSubElement(subElement.id, "notes", event.target.value)}
                                />
                              </label>
                            </div>
                          ))}
                        </div>
                        <Button variant="secondary" onClick={addOpticalSubElement}>
                          Add optical sub-element
                        </Button>
                      </>
                    )}

                    <SectionTitle>Orientation</SectionTitle>
                    <Select
                      label="Orientation"
                      value={selectedAnnotation.fields.orientation ?? "unknown"}
                      onChange={(event) =>
                        updateSelectedField("orientation", event.target.value as MeasurementFields["orientation"])
                      }
                    >
                      {orientationOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                    <Input
                      label="Front side description"
                      value={selectedAnnotation.fields.frontSideDescription ?? ""}
                      onChange={(event) => updateSelectedField("frontSideDescription", event.target.value)}
                    />
                    <Input
                      label="Rear side description"
                      value={selectedAnnotation.fields.rearSideDescription ?? ""}
                      onChange={(event) => updateSelectedField("rearSideDescription", event.target.value)}
                    />

                    <SectionTitle>Coating / Condition</SectionTitle>
                    <Input
                      label="Coating color"
                      value={selectedAnnotation.fields.coatingColor ?? ""}
                      onChange={(event) => updateSelectedField("coatingColor", event.target.value)}
                    />
                    <Input
                      label="Condition"
                      value={selectedAnnotation.fields.condition ?? ""}
                      onChange={(event) => updateSelectedField("condition", event.target.value)}
                    />

                    <SectionTitle>Stepped Profile</SectionTitle>
                    <label className="flex items-center gap-2 text-sm text-labMuted">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedAnnotation.fields.hasSteppedProfile)}
                        onChange={(event) => updateSelectedField("hasSteppedProfile", event.target.checked)}
                      />
                      Has stepped profile
                    </label>

                    {selectedAnnotation.fields.hasSteppedProfile && (
                      <>
                        <NumberInput
                          label="Large diameter (mm)"
                          value={selectedAnnotation.fields.largeDiameterMm ?? ""}
                          min={0}
                          onChange={(event) =>
                            updateSelectedField("largeDiameterMm", parseOptionalNumber(event.target.value))
                          }
                        />
                        <NumberInput
                          label="Small diameter (mm)"
                          value={selectedAnnotation.fields.smallDiameterMm ?? ""}
                          min={0}
                          onChange={(event) =>
                            updateSelectedField("smallDiameterMm", parseOptionalNumber(event.target.value))
                          }
                        />
                        <NumberInput
                          label="Large section thickness (mm)"
                          value={selectedAnnotation.fields.largeSectionThicknessMm ?? ""}
                          min={0}
                          onChange={(event) =>
                            updateSelectedField("largeSectionThicknessMm", parseOptionalNumber(event.target.value))
                          }
                        />
                        <NumberInput
                          label="Small section thickness (mm)"
                          value={selectedAnnotation.fields.smallSectionThicknessMm ?? ""}
                          min={0}
                          onChange={(event) =>
                            updateSelectedField("smallSectionThicknessMm", parseOptionalNumber(event.target.value))
                          }
                        />
                        <Select
                          label="Step direction"
                          value={selectedAnnotation.fields.stepDirection ?? "unknown"}
                          onChange={(event) =>
                            updateSelectedField("stepDirection", event.target.value as StepDirection)
                          }
                        >
                          {stepDirectionOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </>
                    )}
                  </>
                )}

                {selectedAnnotation.itemType === "spacer_ring" && (
                  <>
                    <NumberInput
                      label="Inner diameter (mm)"
                      value={selectedAnnotation.fields.innerDiameterMm ?? ""}
                      min={0}
                      onChange={(event) =>
                        updateSelectedField("innerDiameterMm", parseOptionalNumber(event.target.value))
                      }
                    />
                    <NumberInput
                      label="Outer diameter (mm)"
                      value={selectedAnnotation.fields.outerDiameterMm ?? ""}
                      min={0}
                      onChange={(event) =>
                        updateSelectedField("outerDiameterMm", parseOptionalNumber(event.target.value))
                      }
                    />
                    <NumberInput
                      label="Thickness (mm)"
                      value={selectedAnnotation.fields.thicknessMm ?? ""}
                      min={0}
                      onChange={(event) => updateSelectedField("thicknessMm", parseOptionalNumber(event.target.value))}
                    />
                    <p className="rounded-lg border border-labBorder bg-[#0b0b0b] px-3 py-2 text-xs leading-relaxed text-labMuted">
                      A physical ring/shim that sets the optical air gap between parts. The inner hole stays open for
                      the light path.
                    </p>
                  </>
                )}

                {selectedAnnotation.itemType === "housing_barrel" && (
                  <>
                    <NumberInput
                      label="Inner diameter (mm)"
                      value={selectedAnnotation.fields.innerDiameterMm ?? ""}
                      min={0}
                      onChange={(event) =>
                        updateSelectedField("innerDiameterMm", parseOptionalNumber(event.target.value))
                      }
                    />
                    <NumberInput
                      label="Outer diameter (mm)"
                      value={selectedAnnotation.fields.outerDiameterMm ?? ""}
                      min={0}
                      onChange={(event) =>
                        updateSelectedField("outerDiameterMm", parseOptionalNumber(event.target.value))
                      }
                    />
                    <NumberInput
                      label="Length (mm)"
                      value={selectedAnnotation.fields.lengthMm ?? ""}
                      min={0}
                      onChange={(event) => updateSelectedField("lengthMm", parseOptionalNumber(event.target.value))}
                    />
                  </>
                )}

                {selectedAnnotation.itemType === "iris_disk" && (
                  <>
                    <NumberInput
                      label="Disk diameter (mm)"
                      value={selectedAnnotation.fields.diskDiameterMm ?? ""}
                      min={0}
                      onChange={(event) =>
                        updateSelectedField("diskDiameterMm", parseOptionalNumber(event.target.value))
                      }
                    />
                    <NumberInput
                      label="Aperture diameter (mm)"
                      value={selectedAnnotation.fields.apertureDiameterMm ?? ""}
                      min={0}
                      onChange={(event) =>
                        updateSelectedField("apertureDiameterMm", parseOptionalNumber(event.target.value))
                      }
                    />
                    <NumberInput
                      label="Thickness (mm)"
                      value={selectedAnnotation.fields.thicknessMm ?? ""}
                      min={0}
                      onChange={(event) => updateSelectedField("thicknessMm", parseOptionalNumber(event.target.value))}
                    />
                  </>
                )}

                <label className="flex flex-col gap-1 text-sm text-labMuted">
                  <span>Notes</span>
                  <textarea
                    className="min-h-24 rounded-xl border border-labBorder bg-[#090909] px-3 py-2 text-labText outline-none focus:border-labAccent"
                    value={selectedAnnotation.fields.notes ?? ""}
                    onChange={(event) => updateSelectedField("notes", event.target.value)}
                  />
                </label>

                {syncError && <p className="text-sm text-labDanger">{syncError}</p>}

                <div className="grid gap-2">
                  <Button onClick={createOrSyncStackItem} variant="primary">
                    {selectedAnnotation.linkedStackItemId ? "Update Linked Stack Item" : "Create Stack Item From Annotation"}
                  </Button>
                  {selectedAnnotation.linkedStackItemId && (
                    <p className="mono text-xs text-labMuted">Linked stack item: {selectedAnnotation.linkedStackItemId}</p>
                  )}
                  <Button variant="danger" onClick={deleteSelectedAnnotation}>
                    Delete Annotation
                  </Button>
                </div>
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
