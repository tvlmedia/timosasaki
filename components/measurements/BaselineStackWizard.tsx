"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { NumberInput } from "@/components/common/NumberInput";
import { Select } from "@/components/common/Select";
import { WarningBox } from "@/components/common/WarningBox";
import { getLargestGlassDiameter, getRecommendedBarrelInnerDiameter, getTotalStackLength } from "@/lib/calculations";
import { getDefaultFlangeForMount, normalizeFocusTravelSetup } from "@/lib/focusTravel";
import { createId } from "@/lib/ids";
import type {
  BaselineAirGap,
  BaselineFlangeReference,
  BaselineIris,
  BaselinePhysicalComponent,
  FocusTravelSetup,
  LensMountType,
  LensProject,
  MeasurementAnnotation,
  OriginalLensBaseline,
  StackItem
} from "@/types";

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;
type ApplyMode = "create" | "replace" | "append";
type SequenceNode = {
  key: string;
  label: string;
  kind: "component" | "iris";
  annotationId?: string;
  apertureHintMm: number;
};

type GapDraft = {
  thicknessMm: number;
  innerDiameterMm: number;
  outerDiameterMm: number;
  notes?: string;
};

type IrisDraft = {
  enabled: boolean;
  sourceAnnotationId?: string;
  label: string;
  apertureDiameterMm?: number;
  diskDiameterMm?: number;
  thicknessMm?: number;
  contributesToStackLength: boolean;
  notes?: string;
  positionAfterComponentAnnotationId?: string;
};

type MountDraft = {
  originalMount: LensMountType;
  originalFlangeDistanceMm: number;
  targetMount: LensMountType;
  targetFlangeDistanceMm: number;
  referencePointLabel: string;
  donorFlangeToReferenceInfinityMm?: number;
  donorFlangeToReferenceCloseFocusMm?: number;
  infinityOvertravelMm: number;
  closeFocusExtraMarginMm: number;
};

type StepPair = {
  key: string;
  from: SequenceNode;
  to: SequenceNode;
  label: string;
};

type BuildResult = {
  baseline: OriginalLensBaseline;
  stackItems: StackItem[];
  annotationToStackId: Record<string, string>;
  focusTravel: FocusTravelSetup;
};

type Props = {
  project: LensProject;
  annotations: MeasurementAnnotation[];
  initialBaseline?: OriginalLensBaseline;
  onCancel: () => void;
  onApply: (mode: ApplyMode, payload: BuildResult) => void;
};

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

function toPositive(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

function parseOptionalNumber(raw: string): number | undefined {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function parsePositive(raw: string, fallback: number): number {
  const parsed = Number(raw.trim().replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function formatMm(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return value.toFixed(2).replace(/\.00$/, "");
}

function annotationCenterX(annotation: MeasurementAnnotation): number {
  return annotation.x + annotation.width / 2;
}

function getGlassAnnotations(annotations: MeasurementAnnotation[]): MeasurementAnnotation[] {
  return annotations
    .filter((annotation) => annotation.itemType === "glass")
    .sort((a, b) => annotationCenterX(a) - annotationCenterX(b));
}

function findExistingIrisAnnotation(annotations: MeasurementAnnotation[]): MeasurementAnnotation | undefined {
  return annotations.find((annotation) => annotation.itemType === "iris_disk");
}

function getComponentLabel(annotation: MeasurementAnnotation): string {
  const fields = annotation.fields;
  if (fields.physicalComponentMode === "optical_group") {
    return fields.groupId?.trim() || annotation.label;
  }
  return fields.elementId?.trim() || annotation.label;
}

function getComponentDescription(annotation: MeasurementAnnotation): string {
  const fields = annotation.fields;
  const diameter = toPositive(fields.diameterMm);
  const thickness = toPositive(fields.thicknessMm);
  const size = diameter > 0 && thickness > 0 ? `Ø${formatMm(diameter)} × ${formatMm(thickness)}mm` : "";
  if (fields.physicalComponentMode === "optical_group") {
    const groupType =
      fields.groupType === "cemented_doublet"
        ? "Cemented doublet"
        : fields.groupType === "cemented_triplet"
          ? "Cemented triplet"
          : fields.groupType === "air_spaced_group"
            ? "Air-spaced group"
            : fields.groupType === "fixed_rear_group"
              ? "Fixed rear group"
              : "Unknown group";
    const subCount = fields.opticalSubElements?.length ?? 0;
    return [groupType, `${subCount} optical ${subCount === 1 ? "element" : "elements"}`, size]
      .filter(Boolean)
      .join(" · ");
  }

  const type = fields.elementOverallType?.replace(/_/g, " ") ?? "single element";
  return [type, "single element", size].filter(Boolean).join(" · ");
}

function buildSteppedProfileSegmentsFromFields(
  fields: MeasurementAnnotation["fields"]
): Array<{ id: string; name?: string; diameterMm: number; depthMm: number }> {
  const explicitSegments = (fields.steppedProfileSegments ?? [])
    .map((segment, index) => ({
      id: segment.id || createId("profile"),
      name: segment.name?.trim() || `Segment ${index + 1}`,
      diameterMm: toPositive(segment.diameterMm),
      depthMm: toPositive(segment.depthMm)
    }))
    .filter((segment) => segment.diameterMm > 0 && segment.depthMm > 0);

  const largeDiameterMm = toPositive(fields.largeDiameterMm);
  const smallDiameterMm = toPositive(fields.smallDiameterMm);
  const largeSectionThicknessMm = toPositive(fields.largeSectionThicknessMm);
  const smallSectionThicknessMm = toPositive(fields.smallSectionThicknessMm);
  if (
    largeDiameterMm <= 0 ||
    smallDiameterMm <= 0 ||
    largeSectionThicknessMm <= 0 ||
    smallSectionThicknessMm <= 0
  ) {
    return explicitSegments;
  }

  const generatedFromSteppedFields =
    fields.stepDirection === "large_side_front"
      ? [
          {
            id: createId("profile"),
            name: "Large section (front)",
            diameterMm: largeDiameterMm,
            depthMm: largeSectionThicknessMm
          },
          {
            id: createId("profile"),
            name: "Small section (rear)",
            diameterMm: smallDiameterMm,
            depthMm: smallSectionThicknessMm
          }
        ]
      : [
          {
            id: createId("profile"),
            name: "Small section (front)",
            diameterMm: smallDiameterMm,
            depthMm: smallSectionThicknessMm
          },
          {
            id: createId("profile"),
            name: "Large section (rear)",
            diameterMm: largeDiameterMm,
            depthMm: largeSectionThicknessMm
          }
        ];

  if (!fields.hasSteppedProfile) {
    return explicitSegments.length > 0 ? explicitSegments : generatedFromSteppedFields;
  }

  if (explicitSegments.length >= 2) return explicitSegments;
  return generatedFromSteppedFields;
}

function normalizeAdvancedSections(
  sections:
    | Array<{
        id?: string;
        index?: number;
        label?: string;
        diameterMm?: number;
        lengthMm?: number;
      }>
    | undefined
): Array<{ id: string; index: number; label?: string; diameterMm: number; lengthMm: number }> {
  return (sections ?? []).map((section, index) => ({
    id: section.id || createId("profile"),
    index,
    label: section.label,
    diameterMm: toPositive(section.diameterMm),
    lengthMm: toPositive(section.lengthMm)
  }));
}

function toGlassStackItem(
  annotation: MeasurementAnnotation,
  sourceBaselineComponentId?: string
): StackItem | null {
  const fields = annotation.fields;
  const diameterMm = toPositive(fields.diameterMm);
  const thicknessMm = toPositive(fields.thicknessMm);
  const steppedSegments = buildSteppedProfileSegmentsFromFields(fields);
  const advancedProfile = fields.advancedProfile
    ? {
        enabled: Boolean(fields.advancedProfile.enabled),
        totalLengthMm: toPositive(fields.advancedProfile.totalLengthMm),
        maxDiameterMm: toPositive(fields.advancedProfile.maxDiameterMm),
        maxDiameterPositionFromFrontMm: Number.isFinite(fields.advancedProfile.maxDiameterPositionFromFrontMm)
          ? (fields.advancedProfile.maxDiameterPositionFromFrontMm as number)
          : 0,
        sections: normalizeAdvancedSections(fields.advancedProfile.sections)
      }
    : undefined;
  if (diameterMm <= 0 || thicknessMm <= 0) return null;

  return {
    id: createId("glass"),
    type: "glass",
    opticalType: "GLASS",
    name: annotation.label.trim() || "Measured glass",
    positionIndex: 0,
    diameterMm,
    thicknessMm,
    thicknessMeasurementType: fields.thicknessMeasurementType ?? "unknown",
    thicknessConfidence: fields.thicknessConfidence ?? "unknown",
    advancedProfile,
    advancedProfileEnabled: Boolean(advancedProfile?.enabled) || steppedSegments.length > 0,
    profileSegments:
      advancedProfile?.enabled && advancedProfile.sections.length > 0
        ? advancedProfile.sections.map((section, index) => ({
            id: section.id,
            name: section.label || `Segment ${index + 1}`,
            diameterMm: section.diameterMm,
            depthMm: section.lengthMm
          }))
        : steppedSegments.length > 0
          ? steppedSegments
          : undefined,
    edgeThicknessMm: toPositive(fields.edgeThicknessMm) > 0 ? fields.edgeThicknessMm : undefined,
    clearApertureMm: toPositive(fields.clearApertureMm) > 0 ? fields.clearApertureMm : undefined,
    flipped: fields.orientation === "flipped",
    sourceMeasurementAnnotationId: annotation.id,
    sourceBaselineComponentId,
    physicalComponentMode: fields.physicalComponentMode ?? "single_element",
    groupId: fields.groupId?.trim() || undefined,
    groupType: fields.groupType,
    groupOpticalPowerGuess: fields.groupOpticalPowerGuess,
    opticalSubElements: fields.opticalSubElements ?? [],
    elementId: fields.elementId?.trim() || undefined,
    role: fields.role?.trim() || undefined,
    elementOverallType: fields.elementOverallType,
    frontSurfaceShape: fields.frontSurfaceShape,
    rearSurfaceShape: fields.rearSurfaceShape,
    opticalPowerGuess: fields.opticalPowerGuess,
    orientation: fields.orientation,
    frontSideDescription: fields.frontSideDescription?.trim() || undefined,
    rearSideDescription: fields.rearSideDescription?.trim() || undefined,
    coatingColor: fields.coatingColor?.trim() || undefined,
    condition: fields.condition?.trim() || undefined,
    hasSteppedProfile: Boolean(fields.hasSteppedProfile),
    largeDiameterMm: toPositive(fields.largeDiameterMm) > 0 ? fields.largeDiameterMm : undefined,
    smallDiameterMm: toPositive(fields.smallDiameterMm) > 0 ? fields.smallDiameterMm : undefined,
    largeSectionThicknessMm: toPositive(fields.largeSectionThicknessMm) > 0
      ? fields.largeSectionThicknessMm
      : undefined,
    smallSectionThicknessMm: toPositive(fields.smallSectionThicknessMm) > 0
      ? fields.smallSectionThicknessMm
      : undefined,
    stepDirection: fields.stepDirection,
    cupInsertionSide: "auto",
    cupRetainingSide: "auto",
    retainingLipEnabled: true,
    retainingLipThicknessMm: 1.2,
    notes: fields.notes?.trim() || undefined
  };
}

function buildBaselineComponent(annotation: MeasurementAnnotation): BaselinePhysicalComponent {
  const fields = annotation.fields;
  return {
    id: createId("baseline_component"),
    sourceAnnotationId: annotation.id,
    label: annotation.label,
    componentMode: fields.physicalComponentMode ?? "single_element",
    elementId: fields.elementId?.trim() || undefined,
    role: fields.role?.trim() || undefined,
    diameterMm: toPositive(fields.diameterMm) > 0 ? fields.diameterMm : undefined,
    thicknessMm: toPositive(fields.thicknessMm) > 0 ? fields.thicknessMm : undefined,
    clearApertureMm: toPositive(fields.clearApertureMm) > 0 ? fields.clearApertureMm : undefined,
    groupType: fields.groupType,
    opticalSubElements: fields.opticalSubElements ?? [],
    elementOverallType: fields.elementOverallType,
    frontSurfaceShape: fields.frontSurfaceShape,
    rearSurfaceShape: fields.rearSurfaceShape,
    opticalPowerGuess: fields.opticalPowerGuess,
    hasSteppedProfile: Boolean(fields.hasSteppedProfile),
    largeDiameterMm: toPositive(fields.largeDiameterMm) > 0 ? fields.largeDiameterMm : undefined,
    smallDiameterMm: toPositive(fields.smallDiameterMm) > 0 ? fields.smallDiameterMm : undefined,
    largeSectionThicknessMm: toPositive(fields.largeSectionThicknessMm) > 0
      ? fields.largeSectionThicknessMm
      : undefined,
    smallSectionThicknessMm: toPositive(fields.smallSectionThicknessMm) > 0
      ? fields.smallSectionThicknessMm
      : undefined,
    stepDirection: fields.stepDirection,
    coatingColor: fields.coatingColor?.trim() || undefined,
    condition: fields.condition?.trim() || undefined,
    orientation: fields.orientation,
    notes: fields.notes?.trim() || undefined
  };
}

function getApertureHintForComponent(annotation: MeasurementAnnotation): number {
  const fields = annotation.fields;
  const clearAperture = toPositive(fields.clearApertureMm);
  if (clearAperture > 0) return clearAperture;
  const diameter = toPositive(fields.diameterMm);
  if (diameter > 0) return Math.max(0, diameter - 1);
  return 0;
}

function getSpacingNodes(
  orderedComponents: MeasurementAnnotation[],
  iris: IrisDraft
): SequenceNode[] {
  const componentNodes: SequenceNode[] = orderedComponents.map((annotation) => ({
    key: `component:${annotation.id}`,
    label: getComponentLabel(annotation),
    kind: "component",
    annotationId: annotation.id,
    apertureHintMm: getApertureHintForComponent(annotation)
  }));

  if (!iris.enabled || componentNodes.length === 0) {
    return componentNodes;
  }

  const irisNode: SequenceNode = {
    key: "iris",
    label: iris.label.trim() || "Iris",
    kind: "iris",
    apertureHintMm: toPositive(iris.apertureDiameterMm)
  };

  const insertAfterIndex = componentNodes.findIndex(
    (node) => node.annotationId === iris.positionAfterComponentAnnotationId
  );

  if (insertAfterIndex < 0 || insertAfterIndex >= componentNodes.length - 1) {
    return [...componentNodes, irisNode];
  }

  return [
    ...componentNodes.slice(0, insertAfterIndex + 1),
    irisNode,
    ...componentNodes.slice(insertAfterIndex + 1)
  ];
}

function deriveRecommendedBarrelId(components: MeasurementAnnotation[], project: LensProject): number {
  const pseudoGlass: StackItem[] = components
    .map((annotation, index) => {
      const mapped = toGlassStackItem(annotation);
      if (!mapped || mapped.type !== "glass") return null;
      return {
        ...mapped,
        positionIndex: index
      };
    })
    .filter((item): item is Extract<StackItem, { type: "glass" }> => Boolean(item));

  return getRecommendedBarrelInnerDiameter(pseudoGlass, project.cadDefaults);
}

function makeDefaultGapDraft(
  pair: StepPair,
  recommendedBarrelId: number
): GapDraft {
  const outerDiameterMm = Number(Math.max(10, recommendedBarrelId).toFixed(2));
  const nearbyAperture = Math.max(pair.from.apertureHintMm, pair.to.apertureHintMm);
  const maxInner = Math.max(4, outerDiameterMm - 2.4);
  const minInnerNeeded = nearbyAperture > 0 ? nearbyAperture + 0.3 : outerDiameterMm - 4;
  const innerDiameterMm = Number(Math.min(maxInner, Math.max(4, minInnerNeeded)).toFixed(2));
  return {
    thicknessMm: 1,
    innerDiameterMm,
    outerDiameterMm,
    notes: ""
  };
}

function getPositionAfterIdForIris(
  orderedComponents: MeasurementAnnotation[],
  initial?: string
): string | undefined {
  if (orderedComponents.length <= 1) return orderedComponents[0]?.id;
  if (initial && orderedComponents.some((annotation) => annotation.id === initial)) {
    return initial;
  }
  const mid = Math.max(0, Math.floor((orderedComponents.length - 2) / 2));
  return orderedComponents[mid]?.id;
}

function buildFlangeReference(draft: MountDraft): BaselineFlangeReference {
  return {
    referencePointLabel: draft.referencePointLabel.trim() || "Back of rear group",
    donorFlangeToReferenceInfinityMm: toPositive(draft.donorFlangeToReferenceInfinityMm) > 0
      ? draft.donorFlangeToReferenceInfinityMm
      : undefined,
    donorFlangeToReferenceCloseFocusMm: toPositive(draft.donorFlangeToReferenceCloseFocusMm) > 0
      ? draft.donorFlangeToReferenceCloseFocusMm
      : undefined,
    infinityOvertravelMm: Math.max(0, draft.infinityOvertravelMm),
    closeFocusExtraMarginMm: Math.max(0, draft.closeFocusExtraMarginMm)
  };
}

function mountOffsetText(mount: MountDraft): string {
  const offset = mount.targetFlangeDistanceMm - mount.originalFlangeDistanceMm;
  return `${mount.originalMount} → ${mount.targetMount} offset: ${mount.targetFlangeDistanceMm.toFixed(2)} - ${mount.originalFlangeDistanceMm.toFixed(2)} = ${offset.toFixed(2)}mm`;
}

export function BaselineStackWizard({
  project,
  annotations,
  initialBaseline,
  onCancel,
  onApply
}: Props) {
  const measuredComponents = useMemo(() => getGlassAnnotations(annotations), [annotations]);
  const measuredIrisAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.itemType === "iris_disk"),
    [annotations]
  );
  const measuredHousing = useMemo(
    () => annotations.find((annotation) => annotation.itemType === "housing_barrel"),
    [annotations]
  );

  const initialSelectedIds = useMemo(() => {
    if (initialBaseline?.physicalComponents?.length) {
      const ids = initialBaseline.physicalComponents
        .map((component) => component.sourceAnnotationId)
        .filter((id): id is string => Boolean(id));
      const valid = ids.filter((id) => measuredComponents.some((annotation) => annotation.id === id));
      if (valid.length) return valid;
    }
    return measuredComponents.map((annotation) => annotation.id);
  }, [initialBaseline, measuredComponents]);

  const [step, setStep] = useState<WizardStep>(1);
  const [error, setError] = useState<string>("");
  const [selectedComponentIds, setSelectedComponentIds] = useState<string[]>(initialSelectedIds);
  const [orderedComponentIds, setOrderedComponentIds] = useState<string[]>(initialSelectedIds);

  const existingIris = useMemo(() => findExistingIrisAnnotation(annotations), [annotations]);
  const [irisDraft, setIrisDraft] = useState<IrisDraft>(() => ({
    enabled: Boolean(initialBaseline?.iris ?? existingIris),
    sourceAnnotationId: existingIris?.id,
    label: initialBaseline?.iris?.label ?? existingIris?.label ?? "Original iris plane",
    apertureDiameterMm:
      initialBaseline?.iris?.apertureDiameterMm ??
      existingIris?.fields.apertureDiameterMm ??
      undefined,
    diskDiameterMm: initialBaseline?.iris?.diskDiameterMm ?? existingIris?.fields.diskDiameterMm ?? 30,
    thicknessMm:
      initialBaseline?.iris?.thicknessMm ??
      existingIris?.fields.thicknessMm ??
      0.1,
    contributesToStackLength: initialBaseline?.iris?.contributesToStackLength ?? false,
    notes: initialBaseline?.iris?.notes ?? "",
    positionAfterComponentAnnotationId:
      initialBaseline?.iris?.beforeComponentId
  }));

  const defaultOriginalMount = project.focusTravel?.originalMount ?? initialBaseline?.originalMount ?? "M42";
  const defaultTargetMount = project.focusTravel?.targetMount ?? initialBaseline?.targetMount ?? project.targetMount ?? "PL";
  const [mountDraft, setMountDraft] = useState<MountDraft>(() => ({
    originalMount: defaultOriginalMount,
    originalFlangeDistanceMm:
      initialBaseline?.originalFlangeDistanceMm ??
      project.focusTravel?.originalFlangeDistanceMm ??
      getDefaultFlangeForMount(defaultOriginalMount) ??
      45.46,
    targetMount: defaultTargetMount,
    targetFlangeDistanceMm:
      initialBaseline?.targetFlangeDistanceMm ??
      project.focusTravel?.targetFlangeDistanceMm ??
      getDefaultFlangeForMount(defaultTargetMount) ??
      52,
    referencePointLabel:
      initialBaseline?.flangeReference?.referencePointLabel ??
      project.focusTravel?.referencePointLabel ??
      "Back of rear group",
    donorFlangeToReferenceInfinityMm:
      initialBaseline?.flangeReference?.donorFlangeToReferenceInfinityMm ??
      project.focusTravel?.donorFlangeToReferenceInfinityMm,
    donorFlangeToReferenceCloseFocusMm:
      initialBaseline?.flangeReference?.donorFlangeToReferenceCloseFocusMm ??
      project.focusTravel?.donorFlangeToReferenceCloseFocusMm,
    infinityOvertravelMm:
      initialBaseline?.flangeReference?.infinityOvertravelMm ??
      project.focusTravel?.infinityOvertravelMm ??
      10,
    closeFocusExtraMarginMm:
      initialBaseline?.flangeReference?.closeFocusExtraMarginMm ??
      project.focusTravel?.closeFocusExtraMarginMm ??
      5
  }));

  const [gapByPairKey, setGapByPairKey] = useState<Record<string, GapDraft>>({});

  const selectedComponents = useMemo(() => {
    const selectedSet = new Set(selectedComponentIds);
    const ordered = orderedComponentIds
      .map((id) => measuredComponents.find((annotation) => annotation.id === id))
      .filter((annotation): annotation is MeasurementAnnotation => Boolean(annotation))
      .filter((annotation) => selectedSet.has(annotation.id));

    const missing = measuredComponents
      .filter((annotation) => selectedSet.has(annotation.id))
      .filter((annotation) => !ordered.some((orderedAnnotation) => orderedAnnotation.id === annotation.id));

    return [...ordered, ...missing];
  }, [measuredComponents, orderedComponentIds, selectedComponentIds]);

  useEffect(() => {
    const fallbackAfter = getPositionAfterIdForIris(selectedComponents, irisDraft.positionAfterComponentAnnotationId);
    if (!fallbackAfter || fallbackAfter === irisDraft.positionAfterComponentAnnotationId) return;
    setIrisDraft((current) => ({
      ...current,
      positionAfterComponentAnnotationId: fallbackAfter
    }));
  }, [irisDraft.positionAfterComponentAnnotationId, selectedComponents]);

  const sequenceNodes = useMemo(
    () => getSpacingNodes(selectedComponents, irisDraft),
    [selectedComponents, irisDraft]
  );

  const pairDefinitions = useMemo<StepPair[]>(() => {
    const pairs: StepPair[] = [];
    for (let index = 0; index < sequenceNodes.length - 1; index += 1) {
      const from = sequenceNodes[index];
      const to = sequenceNodes[index + 1];
      pairs.push({
        key: `${from.key}__${to.key}`,
        from,
        to,
        label: `${from.label} → ${to.label}`
      });
    }
    return pairs;
  }, [sequenceNodes]);

  const recommendedBarrelId = useMemo(
    () => deriveRecommendedBarrelId(selectedComponents, project),
    [project, selectedComponents]
  );

  useEffect(() => {
    const pairKeySet = new Set(pairDefinitions.map((pair) => pair.key));
    setGapByPairKey((current) => {
      const next: Record<string, GapDraft> = {};
      let changed = false;
      for (const pair of pairDefinitions) {
        if (current[pair.key]) {
          next[pair.key] = current[pair.key];
        } else {
          next[pair.key] = makeDefaultGapDraft(pair, recommendedBarrelId);
          changed = true;
        }
      }
      for (const existingKey of Object.keys(current)) {
        if (!pairKeySet.has(existingKey)) {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [pairDefinitions, recommendedBarrelId]);

  const generatedPreview = useMemo(() => {
    const pairMap = gapByPairKey;
    const componentByAnnotationId = new Map(
      selectedComponents.map((component) => [component.id, buildBaselineComponent(component)])
    );

    const baselineComponents: BaselinePhysicalComponent[] = selectedComponents.map((annotation) => {
      const component = componentByAnnotationId.get(annotation.id);
      return component as BaselinePhysicalComponent;
    });

    const baselineComponentIdByAnnotationId = new Map(
      baselineComponents.map((component) => [component.sourceAnnotationId ?? "", component.id])
    );

    const irisId = irisDraft.enabled ? createId("baseline_iris") : undefined;
    const baselineIris: BaselineIris | undefined = irisDraft.enabled
      ? {
          id: irisId!,
          label: irisDraft.label.trim() || "Original iris plane",
          positionMode: "between_components",
          beforeComponentId: irisDraft.positionAfterComponentAnnotationId
            ? baselineComponentIdByAnnotationId.get(irisDraft.positionAfterComponentAnnotationId)
            : undefined,
          afterComponentId: (() => {
            const afterIndex = selectedComponents.findIndex(
              (component) => component.id === irisDraft.positionAfterComponentAnnotationId
            );
            if (afterIndex < 0) return undefined;
            const nextComponent = selectedComponents[afterIndex + 1];
            if (!nextComponent) return undefined;
            return baselineComponentIdByAnnotationId.get(nextComponent.id);
          })(),
          apertureDiameterMm: toPositive(irisDraft.apertureDiameterMm) > 0 ? irisDraft.apertureDiameterMm : undefined,
          diskDiameterMm: toPositive(irisDraft.diskDiameterMm) > 0 ? irisDraft.diskDiameterMm : undefined,
          thicknessMm:
            typeof irisDraft.thicknessMm === "number" && Number.isFinite(irisDraft.thicknessMm)
              ? irisDraft.thicknessMm
              : undefined,
          contributesToStackLength: irisDraft.contributesToStackLength,
          notes: irisDraft.notes?.trim() || undefined
        }
      : undefined;

    const baselineGaps: BaselineAirGap[] = pairDefinitions.map((pair) => {
      const gap = pairMap[pair.key] ?? makeDefaultGapDraft(pair, recommendedBarrelId);
      const fromComponentId =
        pair.from.kind === "component"
          ? baselineComponentIdByAnnotationId.get(pair.from.annotationId ?? "")
          : irisId;
      const toComponentId =
        pair.to.kind === "component"
          ? baselineComponentIdByAnnotationId.get(pair.to.annotationId ?? "")
          : irisId;

      return {
        id: createId("baseline_gap"),
        label: `Spacer / Air Gap Ring ${pair.label}`,
        fromComponentId,
        toComponentId,
        thicknessMm: Math.max(0, gap.thicknessMm),
        innerDiameterMm: Math.max(0, gap.innerDiameterMm),
        outerDiameterMm: Math.max(0, gap.outerDiameterMm),
        notes: gap.notes?.trim() || undefined
      };
    });

    const focusTravel = normalizeFocusTravelSetup({
      ...project.focusTravel,
      originalMount: mountDraft.originalMount,
      originalFlangeDistanceMm: mountDraft.originalFlangeDistanceMm,
      targetMount: mountDraft.targetMount,
      targetFlangeDistanceMm: mountDraft.targetFlangeDistanceMm,
      referencePointLabel: mountDraft.referencePointLabel.trim() || "Back of rear group",
      donorFlangeToReferenceInfinityMm:
        toPositive(mountDraft.donorFlangeToReferenceInfinityMm) > 0
          ? mountDraft.donorFlangeToReferenceInfinityMm
          : undefined,
      donorFlangeToReferenceCloseFocusMm:
        toPositive(mountDraft.donorFlangeToReferenceCloseFocusMm) > 0
          ? mountDraft.donorFlangeToReferenceCloseFocusMm
          : undefined,
      infinityOvertravelMm: Math.max(0, mountDraft.infinityOvertravelMm),
      closeFocusExtraMarginMm: Math.max(0, mountDraft.closeFocusExtraMarginMm)
    });

    const baseline: OriginalLensBaseline = {
      id: initialBaseline?.id ?? createId("baseline"),
      name:
        initialBaseline?.name ??
        `${project.donorLens?.trim() || project.name.trim()} Original Lens Baseline`,
      donorLensName: project.donorLens,
      sourceMeasurementPhotoIds: project.measurements.photoUpdatedAt ? [project.measurements.photoUpdatedAt] : [],
      createdAt: initialBaseline?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      housingLengthMm: toPositive(measuredHousing?.fields.lengthMm) > 0 ? measuredHousing?.fields.lengthMm : undefined,
      originalMount: mountDraft.originalMount,
      originalFlangeDistanceMm: mountDraft.originalFlangeDistanceMm,
      targetMount: mountDraft.targetMount,
      targetFlangeDistanceMm: mountDraft.targetFlangeDistanceMm,
      physicalComponents: baselineComponents,
      airGaps: baselineGaps,
      iris: baselineIris,
      flangeReference: buildFlangeReference(mountDraft),
      notes: initialBaseline?.notes
    };

    const annotationToStackId: Record<string, string> = {};
    const nodes = getSpacingNodes(selectedComponents, irisDraft);
    const stackItems: StackItem[] = [];

    nodes.forEach((node, index) => {
      if (node.kind === "component") {
        const annotation = selectedComponents.find((entry) => entry.id === node.annotationId);
        if (annotation) {
          const baselineComponentId = baselineComponentIdByAnnotationId.get(annotation.id);
          const mapped = toGlassStackItem(annotation, baselineComponentId);
          if (mapped) {
            stackItems.push({
              ...mapped,
              positionIndex: stackItems.length
            });
            annotationToStackId[annotation.id] = mapped.id;
          }
        }
      } else if (baselineIris) {
        const irisStackItem: StackItem = {
          id: createId("iris"),
          type: "iris",
          opticalType: "IRIS",
          name: baselineIris.label,
          positionIndex: stackItems.length,
          diskDiameterMm: toPositive(baselineIris.diskDiameterMm) > 0 ? baselineIris.diskDiameterMm! : 30,
          apertureDiameterMm: toPositive(baselineIris.apertureDiameterMm) > 0
            ? baselineIris.apertureDiameterMm!
            : 14,
          thicknessMm:
            baselineIris.contributesToStackLength
              ? Math.max(0, toPositive(baselineIris.thicknessMm) || 1.2)
              : Math.max(0, baselineIris.thicknessMm ?? 0.1),
          isOval: false,
          sourceMeasurementAnnotationId: irisDraft.sourceAnnotationId,
          sourceBaselineComponentId: baselineIris.id,
          notes: baselineIris.notes
        };
        stackItems.push(irisStackItem);
        if (irisDraft.sourceAnnotationId) {
          annotationToStackId[irisDraft.sourceAnnotationId] = irisStackItem.id;
        }
      }

      if (index < nodes.length - 1) {
        const pairKey = `${nodes[index].key}__${nodes[index + 1].key}`;
        const gap = pairMap[pairKey] ?? makeDefaultGapDraft({
          key: pairKey,
          from: nodes[index],
          to: nodes[index + 1],
          label: `${nodes[index].label} → ${nodes[index + 1].label}`
        }, recommendedBarrelId);
        const baselineGap = baselineGaps[index];
        const desiredOpticalAirGapMm = Math.max(0, gap.thicknessMm);
        const spacer: StackItem = {
          id: createId("spacer"),
          type: "spacer",
          opticalType: "SPACER",
          name: baselineGap?.label ?? `Spacer / Air Gap Ring ${nodes[index].label} to ${nodes[index + 1].label}`,
          positionIndex: stackItems.length,
          innerDiameterMm: Math.max(0, gap.innerDiameterMm),
          outerDiameterMm: Math.max(0, gap.outerDiameterMm),
          thicknessMm: desiredOpticalAirGapMm,
          desiredOpticalAirGapMm,
          physicalSpacerThicknessMm: desiredOpticalAirGapMm,
          physicalSpacerThicknessSource: "same_as_airspace",
          airspaceMeasurementType: "unknown",
          airspaceConfidence: "unknown",
          insertedItems: [],
          insertedItemsTotalThicknessMm: 0,
          autoFitToBarrel: false,
          hasAntiReflectionGrooves: false,
          chamferEnabled: false,
          chamferMm: 0.2,
          sourceBaselineComponentId: baselineGap?.id,
          notes: gap.notes?.trim() || undefined
        };
        stackItems.push(spacer);
      }
    });

    const mountStackItem: StackItem = {
      id: createId("mount"),
      type: "mount",
      opticalType: "MOUNT",
      name: `${mountDraft.targetMount} mount reference`,
      positionIndex: stackItems.length,
      mountType: mountDraft.targetMount,
      flangeDistanceMm: mountDraft.targetFlangeDistanceMm,
      innerClearanceMm: recommendedBarrelId,
      notes: mountOffsetText(mountDraft)
    };
    stackItems.push(mountStackItem);

    return {
      baseline,
      stackItems,
      annotationToStackId,
      focusTravel
    };
  }, [
    gapByPairKey,
    initialBaseline,
    irisDraft,
    measuredHousing?.fields.lengthMm,
    mountDraft,
    pairDefinitions,
    project,
    recommendedBarrelId,
    selectedComponents
  ]);

  const previewWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (selectedComponents.length === 0) warnings.push("Select at least one physical component.");

    for (const pair of pairDefinitions) {
      const gap = gapByPairKey[pair.key];
      if (!gap) continue;
      if (gap.thicknessMm <= 0) warnings.push(`${pair.label}: thickness must be > 0.`);
      if (gap.innerDiameterMm <= 0) warnings.push(`${pair.label}: inner diameter must be > 0.`);
      if (gap.outerDiameterMm <= gap.innerDiameterMm) {
        warnings.push(`${pair.label}: outer diameter must be > inner diameter.`);
      }
    }

    if (irisDraft.enabled) {
      if (!toPositive(irisDraft.apertureDiameterMm) || !toPositive(irisDraft.diskDiameterMm)) {
        warnings.push("Iris enabled: set aperture diameter and disk diameter.");
      } else if ((irisDraft.apertureDiameterMm ?? 0) > (irisDraft.diskDiameterMm ?? 0)) {
        warnings.push("Iris aperture cannot be larger than disk diameter.");
      }
    }

    if (mountDraft.originalFlangeDistanceMm <= 0 || mountDraft.targetFlangeDistanceMm <= 0) {
      warnings.push("Flange distances must be positive.");
    }
    if (mountDraft.infinityOvertravelMm < 0 || mountDraft.closeFocusExtraMarginMm < 0) {
      warnings.push("Infinity overtravel and close focus margin must be >= 0.");
    }
    if (
      toPositive(mountDraft.donorFlangeToReferenceCloseFocusMm) > 0 &&
      toPositive(mountDraft.donorFlangeToReferenceInfinityMm) > 0 &&
      (mountDraft.donorFlangeToReferenceCloseFocusMm ?? 0) < (mountDraft.donorFlangeToReferenceInfinityMm ?? 0)
    ) {
      warnings.push("Close focus measurement is smaller than infinity measurement. Check reference direction.");
    }

    return warnings;
  }, [gapByPairKey, irisDraft, mountDraft, pairDefinitions, selectedComponents.length]);

  const stackSummary = useMemo(() => {
    const normalized = generatedPreview.stackItems.map((item, index) => ({ ...item, positionIndex: index }));
    return {
      totalLength: getTotalStackLength(normalized),
      largestGlass: getLargestGlassDiameter(normalized),
      barrelId: getRecommendedBarrelInnerDiameter(normalized, project.cadDefaults),
      barrelOd: getRecommendedBarrelInnerDiameter(normalized, project.cadDefaults) + project.cadDefaults.wallThicknessMm * 2
    };
  }, [generatedPreview.stackItems, project.cadDefaults]);

  const stepTitle =
    step === 1
      ? "Step 1 · Select Physical Components"
      : step === 2
        ? "Step 2 · Order Front → Sensor"
        : step === 3
          ? "Step 3 · Spacer / Air Gap Rings"
          : step === 4
            ? "Step 4 · Iris Setup"
            : step === 5
              ? "Step 5 · Mount / Flange Setup"
              : "Step 6 · Preview Generated Stack";

  const goNext = () => {
    if (step === 1 && selectedComponentIds.length === 0) {
      setError("Select at least one physical component first.");
      return;
    }
    if (step === 3 && pairDefinitions.some((pair) => {
      const gap = gapByPairKey[pair.key];
      return !gap || gap.thicknessMm <= 0 || gap.innerDiameterMm <= 0 || gap.outerDiameterMm <= gap.innerDiameterMm;
    })) {
      setError("One or more spacer / air gap ring values are invalid.");
      return;
    }
    if (step === 4 && irisDraft.enabled) {
      if (!toPositive(irisDraft.apertureDiameterMm) || !toPositive(irisDraft.diskDiameterMm)) {
        setError("Set iris aperture and disk diameter, or disable iris.");
        return;
      }
    }
    if (step < 6) {
      setStep((current) => (current + 1) as WizardStep);
      setError("");
    }
  };

  const goBack = () => {
    if (step > 1) {
      setStep((current) => (current - 1) as WizardStep);
      setError("");
    }
  };

  const applyMode = (mode: ApplyMode) => {
    if (previewWarnings.some((warning) => warning.includes("must be >") || warning.includes("cannot be larger"))) {
      setError("Fix required dimension errors before creating the stack.");
      return;
    }
    onApply(mode, generatedPreview);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
      <div className="w-full max-w-[1180px] rounded-2xl border border-labBorder bg-[#090909] p-4 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-labText">Generate Stack From Measurements</h3>
            <p className="text-xs text-labMuted">Original Lens Baseline wizard</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-labBorder px-2 py-1 text-xs text-labMuted">
              Step {step}/6
            </span>
            <Button variant="ghost" onClick={onCancel}>
              Close
            </Button>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-labBorder bg-[#0b0b0b] p-3">
          <p className="text-sm font-medium text-labText">{stepTitle}</p>
          <p className="mt-1 text-xs text-labMuted">
            Save a baseline before modifying the lens. This stores the measured original donor layout so you can
            always return to original lens data.
          </p>
        </div>

        <div className="mt-3 space-y-3">
          {step === 1 && (
            <section className="rounded-xl border border-labBorder bg-[#0b0b0b] p-3">
              <p className="text-sm text-labMuted">
                Choose measured physical components that should become stack glass items.
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {measuredComponents.length === 0 && (
                  <p className="text-sm text-labMuted">
                    No glass/optical-group annotations found yet. Draw and annotate glass components first.
                  </p>
                )}
                {measuredComponents.map((annotation) => {
                  const checked = selectedComponentIds.includes(annotation.id);
                  return (
                    <label
                      key={annotation.id}
                      className={`rounded-xl border p-3 ${
                        checked ? "border-labAccent bg-[#0d1d2c]" : "border-labBorder bg-[#090909]"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          onChange={(event) => {
                            setSelectedComponentIds((current) => {
                              if (event.target.checked) {
                                const merged = [...current, annotation.id];
                                return Array.from(new Set(merged));
                              }
                              return current.filter((id) => id !== annotation.id);
                            });
                            if (event.target.checked) {
                              setOrderedComponentIds((current) =>
                                current.includes(annotation.id) ? current : [...current, annotation.id]
                              );
                            } else {
                              setOrderedComponentIds((current) => current.filter((id) => id !== annotation.id));
                            }
                          }}
                        />
                        <div>
                          <p className="text-sm text-labText">{getComponentLabel(annotation)}</p>
                          <p className="mt-1 text-xs text-labMuted">{getComponentDescription(annotation)}</p>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="rounded-xl border border-labBorder bg-[#0b0b0b] p-3">
              <p className="text-sm text-labMuted">Order from FRONT to SENSOR.</p>
              <div className="mt-3 space-y-2">
                {selectedComponents.map((annotation, index) => (
                  <div
                    key={annotation.id}
                    className="flex items-center justify-between rounded-xl border border-labBorder bg-[#090909] px-3 py-2"
                  >
                    <div>
                      <p className="text-sm text-labText">{index + 1}. {getComponentLabel(annotation)}</p>
                      <p className="text-xs text-labMuted">{getComponentDescription(annotation)}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs"
                        disabled={index === 0}
                        onClick={() => {
                          setOrderedComponentIds((current) => {
                            const next = [...current];
                            const pos = next.indexOf(annotation.id);
                            if (pos <= 0) return current;
                            [next[pos - 1], next[pos]] = [next[pos], next[pos - 1]];
                            return next;
                          });
                        }}
                      >
                        Up
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs"
                        disabled={index === selectedComponents.length - 1}
                        onClick={() => {
                          setOrderedComponentIds((current) => {
                            const next = [...current];
                            const pos = next.indexOf(annotation.id);
                            if (pos < 0 || pos >= next.length - 1) return current;
                            [next[pos], next[pos + 1]] = [next[pos + 1], next[pos]];
                            return next;
                          });
                        }}
                      >
                        Down
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="rounded-xl border border-labBorder bg-[#0b0b0b] p-3">
              <p className="text-sm text-labMuted">
                AirSpace is the optical/layout target between adjacent elements.
              </p>
              <p className="mt-1 text-xs text-labMuted">
                Printed spacer thickness defaults to the same value for now. Defaults use nearby clear aperture and
                recommended barrel ID ({formatMm(recommendedBarrelId)}mm).
              </p>
              <div className="mt-3 space-y-3">
                {pairDefinitions.length === 0 && (
                  <p className="text-sm text-labMuted">Need at least two sequence nodes to define spacing rings.</p>
                )}
                {pairDefinitions.map((pair) => {
                  const gap = gapByPairKey[pair.key] ?? makeDefaultGapDraft(pair, recommendedBarrelId);
                  return (
                    <div key={pair.key} className="rounded-xl border border-labBorder bg-[#090909] p-3">
                      <p className="text-sm text-labText">{pair.label}</p>
                      <div className="mt-2 grid gap-2 md:grid-cols-3">
                        <NumberInput
                          label="Desired optical airspace (mm)"
                          value={gap.thicknessMm}
                          min={0}
                          step="0.01"
                          onChange={(event) => {
                            const parsed = parseOptionalNumber(event.target.value);
                            setGapByPairKey((current) => ({
                              ...current,
                              [pair.key]: {
                                ...gap,
                                thicknessMm: parsed ?? 0
                              }
                            }));
                          }}
                        />
                        <NumberInput
                          label="Inner diameter (mm)"
                          value={gap.innerDiameterMm}
                          min={0}
                          step="0.01"
                          onChange={(event) => {
                            const parsed = parseOptionalNumber(event.target.value);
                            setGapByPairKey((current) => ({
                              ...current,
                              [pair.key]: {
                                ...gap,
                                innerDiameterMm: parsed ?? 0
                              }
                            }));
                          }}
                        />
                        <NumberInput
                          label="Outer diameter (mm)"
                          value={gap.outerDiameterMm}
                          min={0}
                          step="0.01"
                          onChange={(event) => {
                            const parsed = parseOptionalNumber(event.target.value);
                            setGapByPairKey((current) => ({
                              ...current,
                              [pair.key]: {
                                ...gap,
                                outerDiameterMm: parsed ?? 0
                              }
                            }));
                          }}
                        />
                      </div>
                      <Input
                        label="Notes"
                        value={gap.notes ?? ""}
                        onChange={(event) =>
                          setGapByPairKey((current) => ({
                            ...current,
                            [pair.key]: {
                              ...gap,
                              notes: event.target.value
                            }
                          }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {step === 4 && (
            <section className="rounded-xl border border-labBorder bg-[#0b0b0b] p-3">
              <label className="flex items-center gap-2 text-sm text-labMuted">
                <input
                  type="checkbox"
                  checked={irisDraft.enabled}
                  onChange={(event) =>
                    setIrisDraft((current) => ({
                      ...current,
                      enabled: event.target.checked
                    }))
                  }
                />
                Original lens has an iris/aperture stop
              </label>
              {irisDraft.enabled && (
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <Select
                    label="Use measured iris annotation"
                    value={irisDraft.sourceAnnotationId ?? ""}
                    onChange={(event) => {
                      const annotation = measuredIrisAnnotations.find((entry) => entry.id === event.target.value);
                      setIrisDraft((current) => ({
                        ...current,
                        sourceAnnotationId: event.target.value || undefined,
                        label: annotation?.label ?? current.label,
                        apertureDiameterMm: annotation?.fields.apertureDiameterMm ?? current.apertureDiameterMm,
                        diskDiameterMm: annotation?.fields.diskDiameterMm ?? current.diskDiameterMm,
                        thicknessMm: annotation?.fields.thicknessMm ?? current.thicknessMm
                      }));
                    }}
                  >
                    <option value="">Manual</option>
                    {measuredIrisAnnotations.map((annotation) => (
                      <option key={annotation.id} value={annotation.id}>
                        {annotation.label}
                      </option>
                    ))}
                  </Select>
                  <Select
                    label="Iris position"
                    value={irisDraft.positionAfterComponentAnnotationId ?? ""}
                    onChange={(event) =>
                      setIrisDraft((current) => ({
                        ...current,
                        positionAfterComponentAnnotationId: event.target.value || undefined
                      }))
                    }
                  >
                    {selectedComponents.map((component, index) => (
                      <option key={component.id} value={component.id}>
                        {index === selectedComponents.length - 1
                          ? `After ${getComponentLabel(component)}`
                          : `Between ${getComponentLabel(component)} and ${
                              selectedComponents[index + 1]
                                ? getComponentLabel(selectedComponents[index + 1])
                                : "next component"
                            }`}
                      </option>
                    ))}
                  </Select>
                  <Input
                    label="Iris label"
                    value={irisDraft.label}
                    onChange={(event) => setIrisDraft((current) => ({ ...current, label: event.target.value }))}
                  />
                  <NumberInput
                    label="Aperture diameter (mm)"
                    value={irisDraft.apertureDiameterMm ?? ""}
                    min={0}
                    onChange={(event) =>
                      setIrisDraft((current) => ({
                        ...current,
                        apertureDiameterMm: parseOptionalNumber(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Disk diameter (mm)"
                    value={irisDraft.diskDiameterMm ?? ""}
                    min={0}
                    onChange={(event) =>
                      setIrisDraft((current) => ({
                        ...current,
                        diskDiameterMm: parseOptionalNumber(event.target.value)
                      }))
                    }
                  />
                  <NumberInput
                    label="Thickness (mm)"
                    value={irisDraft.thicknessMm ?? ""}
                    min={0}
                    onChange={(event) =>
                      setIrisDraft((current) => ({
                        ...current,
                        thicknessMm: parseOptionalNumber(event.target.value)
                      }))
                    }
                  />
                  <label className="flex items-center gap-2 text-sm text-labMuted">
                    <input
                      type="checkbox"
                      checked={irisDraft.contributesToStackLength}
                      onChange={(event) =>
                        setIrisDraft((current) => ({
                          ...current,
                          contributesToStackLength: event.target.checked
                        }))
                      }
                    />
                    Iris contributes to stack length
                  </label>
                </div>
              )}
            </section>
          )}

          {step === 5 && (
            <section className="rounded-xl border border-labBorder bg-[#0b0b0b] p-3">
              <div className="grid gap-2 md:grid-cols-2">
                <Select
                  label="Original mount"
                  value={mountDraft.originalMount}
                  onChange={(event) => {
                    const mount = event.target.value as LensMountType;
                    setMountDraft((current) => ({
                      ...current,
                      originalMount: mount,
                      originalFlangeDistanceMm: getDefaultFlangeForMount(mount) ?? current.originalFlangeDistanceMm
                    }));
                  }}
                >
                  {mountOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <NumberInput
                  label="Original flange distance (mm)"
                  value={mountDraft.originalFlangeDistanceMm}
                  min={0}
                  step="0.01"
                  onChange={(event) =>
                    setMountDraft((current) => ({
                      ...current,
                      originalFlangeDistanceMm: parsePositive(event.target.value, current.originalFlangeDistanceMm)
                    }))
                  }
                />
                <Select
                  label="Target mount"
                  value={mountDraft.targetMount}
                  onChange={(event) => {
                    const mount = event.target.value as LensMountType;
                    setMountDraft((current) => ({
                      ...current,
                      targetMount: mount,
                      targetFlangeDistanceMm: getDefaultFlangeForMount(mount) ?? current.targetFlangeDistanceMm
                    }));
                  }}
                >
                  {mountOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <NumberInput
                  label="Target flange distance (mm)"
                  value={mountDraft.targetFlangeDistanceMm}
                  min={0}
                  step="0.01"
                  onChange={(event) =>
                    setMountDraft((current) => ({
                      ...current,
                      targetFlangeDistanceMm: parsePositive(event.target.value, current.targetFlangeDistanceMm)
                    }))
                  }
                />
              </div>
              <p className="mt-2 text-sm text-labMuted">{mountOffsetText(mountDraft)}</p>
              <p className="mt-1 text-xs text-labMuted">
                The original {mountDraft.originalMount} flange reference plane must sit{" "}
                {(mountDraft.targetFlangeDistanceMm - mountDraft.originalFlangeDistanceMm).toFixed(2)}mm{" "}
                {(mountDraft.targetFlangeDistanceMm - mountDraft.originalFlangeDistanceMm) >= 0
                  ? "behind"
                  : "in front of"}{" "}
                the {mountDraft.targetMount} flange plane.
              </p>

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <Input
                  label="Reference point label"
                  value={mountDraft.referencePointLabel}
                  onChange={(event) =>
                    setMountDraft((current) => ({ ...current, referencePointLabel: event.target.value }))
                  }
                />
                <NumberInput
                  label="Donor flange → reference @ infinity (mm)"
                  value={mountDraft.donorFlangeToReferenceInfinityMm ?? ""}
                  min={0}
                  step="0.01"
                  onChange={(event) =>
                    setMountDraft((current) => ({
                      ...current,
                      donorFlangeToReferenceInfinityMm: parseOptionalNumber(event.target.value)
                    }))
                  }
                />
                <NumberInput
                  label="Donor flange → reference @ close focus (mm)"
                  value={mountDraft.donorFlangeToReferenceCloseFocusMm ?? ""}
                  min={0}
                  step="0.01"
                  onChange={(event) =>
                    setMountDraft((current) => ({
                      ...current,
                      donorFlangeToReferenceCloseFocusMm: parseOptionalNumber(event.target.value)
                    }))
                  }
                />
                <NumberInput
                  label="Infinity overtravel (mm)"
                  value={mountDraft.infinityOvertravelMm}
                  min={0}
                  step="0.1"
                  onChange={(event) =>
                    setMountDraft((current) => ({
                      ...current,
                      infinityOvertravelMm: Math.max(0, Number(event.target.value || 0))
                    }))
                  }
                />
                <NumberInput
                  label="Close focus extra margin (mm)"
                  value={mountDraft.closeFocusExtraMarginMm}
                  min={0}
                  step="0.1"
                  onChange={(event) =>
                    setMountDraft((current) => ({
                      ...current,
                      closeFocusExtraMarginMm: Math.max(0, Number(event.target.value || 0))
                    }))
                  }
                />
              </div>
            </section>
          )}

          {step === 6 && (
            <section className="rounded-xl border border-labBorder bg-[#0b0b0b] p-3">
              <p className="text-sm text-labMuted">Preview of generated stack (front to sensor).</p>
              <div className="mt-2 space-y-1 rounded-lg border border-labBorder bg-[#090909] p-3">
                {generatedPreview.stackItems.map((item, index) => (
                  <p key={item.id} className="text-sm text-labText">
                    {index + 1}. {item.name} <span className="text-labMuted">({item.type})</span>
                  </p>
                ))}
              </div>

              <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                <p className="text-labMuted">
                  Total stack length: <span className="mono text-labText">{formatMm(stackSummary.totalLength)}mm</span>
                </p>
                <p className="text-labMuted">
                  Largest glass diameter: <span className="mono text-labText">{formatMm(stackSummary.largestGlass)}mm</span>
                </p>
                <p className="text-labMuted">
                  Recommended barrel ID: <span className="mono text-labText">{formatMm(stackSummary.barrelId)}mm</span>
                </p>
                <p className="text-labMuted">
                  Recommended barrel OD: <span className="mono text-labText">{formatMm(stackSummary.barrelOd)}mm</span>
                </p>
              </div>
            </section>
          )}
        </div>

        <div className="mt-3">
          <WarningBox title="Wizard Checks" lines={previewWarnings} />
        </div>
        {error && <p className="mt-2 text-sm text-labDanger">{error}</p>}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button variant="ghost" onClick={goBack} disabled={step === 1}>
              Back
            </Button>
            <Button variant="secondary" onClick={goNext} disabled={step === 6}>
              Next
            </Button>
          </div>
          {step === 6 ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => applyMode("create")}>
                Create Stack
              </Button>
              <Button variant="secondary" onClick={() => applyMode("replace")}>
                Replace Existing Stack
              </Button>
              <Button variant="secondary" onClick={() => applyMode("append")}>
                Append To Existing Stack
              </Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
