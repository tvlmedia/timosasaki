"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AssemblyPreviewColorRole, AssemblyPreviewDerived, AssemblyPreviewPart } from "@/lib/assemblyPreview";

type InteractivePart = AssemblyPreviewPart & {
  displayStartMm: number;
  displayEndMm: number;
  displayIndex: number;
};

type ViewerAvailability = "loading" | "ready" | "unavailable" | "error";

type ThreeAssemblyPreviewProps = {
  parts: InteractivePart[];
  derived: AssemblyPreviewDerived;
  selectedId: string | null;
  onSelectId: (id: string | null) => void;
  onAvailabilityChange?: (available: boolean) => void;
  resetSignal: number;
  displayOptions: ThreeAssemblyDisplayOptions;
};

type RoleVisualStyle = {
  color: number;
  metalness: number;
  roughness: number;
};

const ROLE_VISUAL_STYLE: Record<AssemblyPreviewColorRole, RoleVisualStyle> = {
  cup: { color: 0xf2bf4e, metalness: 0.2, roughness: 0.52 },
  spacer: { color: 0xd9e1e8, metalness: 0.12, roughness: 0.6 },
  insert: { color: 0xff9e57, metalness: 0.1, roughness: 0.45 },
  carrier: { color: 0x67d29f, metalness: 0.08, roughness: 0.55 },
  barrel: { color: 0x62b8d8, metalness: 0.08, roughness: 0.6 },
  ring: { color: 0xb9c3cd, metalness: 0.1, roughness: 0.64 },
  custom: { color: 0xb6c2d6, metalness: 0.12, roughness: 0.62 }
};

const XRAY_ROLE_OPACITY: Record<AssemblyPreviewColorRole, number> = {
  cup: 0.72,
  spacer: 0.66,
  insert: 0.94,
  carrier: 0.22,
  barrel: 0.16,
  ring: 0.68,
  custom: 0.68
};

const SOLID_ROLE_OPACITY: Record<AssemblyPreviewColorRole, number> = {
  cup: 0.84,
  spacer: 0.82,
  insert: 0.98,
  carrier: 0.36,
  barrel: 0.3,
  ring: 0.82,
  custom: 0.82
};

function getRoleOpacity(role: AssemblyPreviewColorRole, xRayMode: boolean): number {
  return xRayMode ? XRAY_ROLE_OPACITY[role] : SOLID_ROLE_OPACITY[role];
}

function getRoleRenderOrder(role: AssemblyPreviewColorRole): number {
  if (role === "barrel") return 0;
  if (role === "carrier") return 1;
  return 2;
}

function shouldShowPartByRole(
  part: AssemblyPreviewPart,
  options: ThreeAssemblyDisplayOptions
): boolean {
  if (part.colorRole === "cup" || part.colorRole === "spacer" || part.colorRole === "ring") {
    return options.showCupsAndSpacers;
  }
  if (part.colorRole === "insert" || part.type === "iris" || part.type === "filter" || part.type === "diffusion") {
    return options.showInserts;
  }
  if (part.type === "custom" && part.colorRole !== "custom") {
    return options.showInserts;
  }
  if (part.colorRole === "custom") {
    return options.showCupsAndSpacers || options.showInserts;
  }
  return true;
}

export type ThreeAssemblyDisplayOptions = {
  showFixedBarrel: boolean;
  showCarrier: boolean;
  showCupsAndSpacers: boolean;
  showInserts: boolean;
  xRayMode: boolean;
};

function resolveInnerDiameterMm(part: AssemblyPreviewPart): number {
  const aperture = typeof part.apertureDiameterMm === "number" && Number.isFinite(part.apertureDiameterMm)
    ? part.apertureDiameterMm
    : 0;
  const inner = typeof part.innerDiameterMm === "number" && Number.isFinite(part.innerDiameterMm)
    ? part.innerDiameterMm
    : 0;

  const candidate = Math.max(aperture, inner);
  if (candidate > 0) return candidate;

  if (part.type === "lens_cup") {
    return Math.max(0.8, part.outerDiameterMm * 0.62);
  }
  return 0;
}

function toFinitePositive(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

export function ThreeAssemblyPreview({
  parts,
  derived,
  selectedId,
  onSelectId,
  onAvailabilityChange,
  resetSignal,
  displayOptions
}: ThreeAssemblyPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const rendererRef = useRef<any>(null);
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const controlsRef = useRef<any>(null);
  const THREERef = useRef<any>(null);
  const rootGroupRef = useRef<any>(null);
  const raycasterRef = useRef<any>(null);
  const pickableRef = useRef<any[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const [availability, setAvailability] = useState<ViewerAvailability>("loading");
  const [sceneReadyVersion, setSceneReadyVersion] = useState(0);
  const availabilityRef = useRef<ViewerAvailability>("loading");

  const bounds = useMemo(() => {
    const fallbackLength = Math.max(
      1,
      derived.mechanicalStackLengthMm,
      derived.carrierLengthMm,
      derived.fixedBarrelLengthMm
    );
    const start = parts.length > 0 ? parts[0].displayStartMm : 0;
    const end = parts.length > 0 ? parts[parts.length - 1].displayEndMm : start + fallbackLength;
    const displayLength = Math.max(1, end - start, fallbackLength);
    const maxPartDiameter = parts.reduce((max, part) => Math.max(max, part.outerDiameterMm), 0);
    const maxDiameter = Math.max(maxPartDiameter, derived.carrierOuterDiameterMm, derived.fixedBarrelOuterDiameterMm, 12);
    return {
      startMm: start,
      endMm: end,
      lengthMm: displayLength,
      maxDiameterMm: maxDiameter
    };
  }, [
    parts,
    derived.mechanicalStackLengthMm,
    derived.carrierLengthMm,
    derived.fixedBarrelLengthMm,
    derived.carrierOuterDiameterMm,
    derived.fixedBarrelOuterDiameterMm
  ]);

  const setAvailabilityState = (next: ViewerAvailability) => {
    if (availabilityRef.current === next) return;
    availabilityRef.current = next;
    setAvailability(next);
    if (onAvailabilityChange) {
      onAvailabilityChange(next === "ready");
    }
  };

  const positionCamera = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const length = Math.max(1, bounds.lengthMm);
    const diameter = Math.max(1, bounds.maxDiameterMm);

    camera.position.set(length * 0.78, diameter * 0.95, diameter * 1.4);
    camera.near = 0.1;
    camera.far = Math.max(2000, length * 30 + diameter * 30);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    controls.target.set(0, 0, 0);
    controls.update();
  };

  useEffect(() => {
    let cancelled = false;

    const mount = async () => {
      const container = containerRef.current;
      if (!container) return;

      const testCanvas = document.createElement("canvas");
      const webglContext = testCanvas.getContext("webgl2") || testCanvas.getContext("webgl");
      if (!webglContext) {
        setAvailabilityState("unavailable");
        return;
      }

      try {
        const THREE = await import("three");
        const orbitModule = await import("three/examples/jsm/controls/OrbitControls.js");
        if (cancelled) return;

        THREERef.current = THREE;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x060606, 1);
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        const initialWidth = Math.max(260, container.clientWidth);
        const initialHeight = Math.max(300, container.clientHeight);
        renderer.setSize(initialWidth, initialHeight, false);
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.display = "block";

        container.innerHTML = "";
        container.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, initialWidth / initialHeight, 0.1, 2000);
        const controls = new orbitModule.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enablePan = true;
        controls.enableZoom = true;
        controls.screenSpacePanning = true;

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.82);
        keyLight.position.set(1.1, 1.4, 0.9);
        const fillLight = new THREE.DirectionalLight(0x88aacc, 0.34);
        fillLight.position.set(-1.2, -0.6, -0.8);

        scene.add(ambientLight);
        scene.add(keyLight);
        scene.add(fillLight);

        const rootGroup = new THREE.Group();
        rootGroup.name = "assembly-root";
        scene.add(rootGroup);

        rendererRef.current = renderer;
        sceneRef.current = scene;
        cameraRef.current = camera;
        controlsRef.current = controls;
        rootGroupRef.current = rootGroup;
        setSceneReadyVersion((value) => value + 1);

        const raycaster = new THREE.Raycaster();
        raycasterRef.current = raycaster;

        const pointer = new THREE.Vector2();

        const onPointerDown = (event: PointerEvent) => {
          const dom = renderer.domElement;
          const rect = dom.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return;

          pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

          raycaster.setFromCamera(pointer, camera);
          const intersections = raycaster.intersectObjects(pickableRef.current, false);
          if (!intersections.length) {
            onSelectId(null);
            return;
          }

          const preferredHit =
            intersections.find((intersection) => {
              const id = intersection.object?.userData?.partId;
              return typeof id === "string" && id !== "__carrier" && id !== "__fixed_barrel";
            }) ?? intersections.find((intersection) => typeof intersection.object?.userData?.partId === "string");

          const hitPartId = preferredHit?.object?.userData?.partId;
          if (typeof hitPartId === "string") {
            onSelectId(hitPartId);
          }
        };

        renderer.domElement.addEventListener("pointerdown", onPointerDown);

        const resizeObserver = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry) return;
          const width = Math.max(260, Math.floor(entry.contentRect.width));
          const height = Math.max(300, Math.floor(entry.contentRect.height));
          renderer.setSize(width, height, false);
          renderer.domElement.style.width = "100%";
          renderer.domElement.style.height = "100%";
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        });
        resizeObserver.observe(container);
        resizeObserverRef.current = resizeObserver;

        const animate = () => {
          if (cancelled) return;
          controls.update();
          renderer.render(scene, camera);
          animationFrameRef.current = window.requestAnimationFrame(animate);
        };

        positionCamera();
        animate();

        setAvailabilityState("ready");

        return () => {
          renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        };
      } catch {
        if (cancelled) return;
        setAvailabilityState("error");
      }
    };

    let unbind: (() => void) | undefined;
    mount().then((cleanup) => {
      unbind = cleanup;
    });

    return () => {
      cancelled = true;
      if (unbind) unbind();

      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }

      const controls = controlsRef.current;
      if (controls?.dispose) controls.dispose();

      const rootGroup = rootGroupRef.current;
      if (rootGroup) {
        while (rootGroup.children.length > 0) {
          const child = rootGroup.children.pop();
          if (!child) continue;
          child.traverse((node: any) => {
            if (node.geometry?.dispose) node.geometry.dispose();
            if (node.material) {
              if (Array.isArray(node.material)) {
                node.material.forEach((material: any) => material.dispose?.());
              } else {
                node.material.dispose?.();
              }
            }
          });
        }
      }

      const scene = sceneRef.current;
      if (scene && rootGroup) {
        scene.remove(rootGroup);
      }

      const renderer = rendererRef.current;
      if (renderer) {
        renderer.dispose();
        const canvas = renderer.domElement;
        canvas?.remove?.();
      }

      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      rootGroupRef.current = null;
      pickableRef.current = [];
      raycasterRef.current = null;
      THREERef.current = null;
    };
  }, [onSelectId]);

  useEffect(() => {
    const THREE = THREERef.current;
    const rootGroup = rootGroupRef.current;
    if (!THREE || !rootGroup || availability !== "ready") return;

    while (rootGroup.children.length > 0) {
      const child = rootGroup.children.pop();
      if (!child) continue;
      child.traverse((node: any) => {
        if (node.geometry?.dispose) node.geometry.dispose();
        if (node.material) {
          if (Array.isArray(node.material)) {
            node.material.forEach((material: any) => material.dispose?.());
          } else {
            node.material.dispose?.();
          }
        }
      });
    }
    pickableRef.current = [];

    const localStartMm = bounds.startMm;
    const totalLengthMm = bounds.lengthMm;
    const centeredX = (valueMm: number) => valueMm - localStartMm - totalLengthMm * 0.5;

    const createTubeGroup = (params: {
      id: string;
      label: string;
      lengthMm: number;
      outerDiameterMm: number;
      innerDiameterMm?: number;
      centerXmm: number;
      role: AssemblyPreviewColorRole;
      selected: boolean;
      transparentOverride?: boolean;
      opacityOverride?: number;
      shellMode?: "none" | "carrier" | "barrel";
    }) => {
      const group = new THREE.Group();
      group.name = `${params.id}:${params.label}`;

      const style = ROLE_VISUAL_STYLE[params.role];
      const lengthMm = Math.max(0.2, params.lengthMm);
      const outerRadiusMm = Math.max(0.25, params.outerDiameterMm * 0.5);
      const innerDiameterMm = Math.max(0, toFinitePositive(params.innerDiameterMm));
      const innerRadiusMm = Math.max(0, innerDiameterMm * 0.5);
      const isShell = params.shellMode === "carrier" || params.shellMode === "barrel";
      const opacity = params.opacityOverride ?? getRoleOpacity(params.role, displayOptions.xRayMode);
      const renderOrder = getRoleRenderOrder(params.role);

      const outerGeometry = new THREE.CylinderGeometry(outerRadiusMm, outerRadiusMm, lengthMm, 56, 1, false);
      const outerMaterial = new THREE.MeshStandardMaterial({
        color: style.color,
        transparent: params.transparentOverride ?? opacity < 0.999 || isShell,
        opacity,
        metalness: style.metalness,
        roughness: style.roughness,
        depthWrite: !isShell,
        side: isShell ? THREE.DoubleSide : THREE.FrontSide
      });
      if (params.selected) {
        outerMaterial.emissive = new THREE.Color(0x6da8ff);
        outerMaterial.emissiveIntensity = isShell ? 0.25 : 0.45;
      }
      const outerMesh = new THREE.Mesh(outerGeometry, outerMaterial);
      outerMesh.rotation.z = Math.PI / 2;
      outerMesh.position.x = params.centerXmm;
      outerMesh.userData.partId = params.id;
      outerMesh.renderOrder = renderOrder;
      group.add(outerMesh);
      pickableRef.current.push(outerMesh);

      const effectiveInnerRadiusMm =
        innerRadiusMm > 0 && innerRadiusMm < outerRadiusMm - 0.18 ? innerRadiusMm : 0;

      if (effectiveInnerRadiusMm > 0 && !isShell) {
        const innerGeometry = new THREE.CylinderGeometry(
          effectiveInnerRadiusMm,
          effectiveInnerRadiusMm,
          lengthMm + 0.35,
          48,
          1,
          false
        );
        const innerMaterial = new THREE.MeshStandardMaterial({
          color: 0x050505,
          metalness: 0,
          roughness: 0.9
        });
        const innerMesh = new THREE.Mesh(innerGeometry, innerMaterial);
        innerMesh.rotation.z = Math.PI / 2;
        innerMesh.position.x = params.centerXmm;
        innerMesh.userData.partId = params.id;
        innerMesh.renderOrder = renderOrder + 0.1;
        group.add(innerMesh);
        pickableRef.current.push(innerMesh);
      }

      const edgeRadiusMm = Math.max(0.08, outerRadiusMm * 0.05);
      const rimGeometry = new THREE.TorusGeometry(
        Math.max(0.05, outerRadiusMm - edgeRadiusMm),
        edgeRadiusMm,
        8,
        40
      );
      const rimMaterial = new THREE.MeshStandardMaterial({
        color: 0x111111,
        transparent: true,
        opacity: 0.35,
        roughness: 0.6,
        metalness: 0.08
      });
      const rimFront = new THREE.Mesh(rimGeometry, rimMaterial);
      rimFront.rotation.y = Math.PI / 2;
      rimFront.position.x = params.centerXmm - lengthMm * 0.5;
      rimFront.userData.partId = params.id;
      rimFront.renderOrder = renderOrder + 0.15;
      const rimBack = rimFront.clone();
      rimBack.position.x = params.centerXmm + lengthMm * 0.5;
      rimBack.renderOrder = renderOrder + 0.15;
      group.add(rimFront);
      group.add(rimBack);
      pickableRef.current.push(rimFront, rimBack);

      return group;
    };

    parts.forEach((part) => {
      if (!shouldShowPartByRole(part, displayOptions)) return;
      const centerXmm = centeredX(part.displayStartMm + part.lengthMm * 0.5);
      const inferredInnerMm = resolveInnerDiameterMm(part);
      const tube = createTubeGroup({
        id: part.id,
        label: part.label,
        lengthMm: part.lengthMm,
        outerDiameterMm: part.outerDiameterMm,
        innerDiameterMm: inferredInnerMm > 0 ? inferredInnerMm : undefined,
        centerXmm,
        role: part.colorRole,
        selected: selectedId === part.id
      });
      rootGroup.add(tube);
    });

    const barrelLengthMm = Math.max(derived.fixedBarrelLengthMm, bounds.lengthMm);
    const carrierLengthMm = Math.max(derived.carrierLengthMm, bounds.lengthMm);

    if (displayOptions.showFixedBarrel) {
      const barrelCenterXmm = centeredX(bounds.startMm + barrelLengthMm * 0.5);
      const barrel = createTubeGroup({
        id: "__fixed_barrel",
        label: "Fixed PL barrel",
        lengthMm: barrelLengthMm,
        outerDiameterMm: Math.max(derived.fixedBarrelOuterDiameterMm, derived.fixedBarrelInnerDiameterMm + 0.2),
        innerDiameterMm: derived.fixedBarrelInnerDiameterMm,
        centerXmm: barrelCenterXmm,
        role: "barrel",
        selected: selectedId === "__fixed_barrel",
        transparentOverride: true,
        shellMode: "barrel"
      });
      rootGroup.add(barrel);
    }

    if (displayOptions.showCarrier) {
      const carrierCenterXmm = centeredX(bounds.startMm + carrierLengthMm * 0.5);
      const carrier = createTubeGroup({
        id: "__carrier",
        label: "Sliding optical carrier",
        lengthMm: carrierLengthMm,
        outerDiameterMm: Math.max(derived.carrierOuterDiameterMm, derived.carrierInnerDiameterMm + 0.2),
        innerDiameterMm: derived.carrierInnerDiameterMm,
        centerXmm: carrierCenterXmm,
        role: "carrier",
        selected: selectedId === "__carrier",
        transparentOverride: true,
        shellMode: "carrier"
      });
      rootGroup.add(carrier);
    }

    const axisMaterial = new THREE.LineBasicMaterial({ color: 0x4d84c3, transparent: true, opacity: 0.8 });
    const axisGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(centeredX(bounds.startMm) - 6, 0, 0),
      new THREE.Vector3(centeredX(bounds.startMm + Math.max(bounds.lengthMm, carrierLengthMm, barrelLengthMm)) + 6, 0, 0)
    ]);
    const axisLine = new THREE.Line(axisGeometry, axisMaterial);
    rootGroup.add(axisLine);

    positionCamera();
  }, [parts, derived, selectedId, bounds, sceneReadyVersion, availability, displayOptions]);

  useEffect(() => {
    if (availabilityRef.current !== "ready") return;
    positionCamera();
  }, [resetSignal]);

  if (availability === "unavailable") {
    return (
      <div className="flex h-[470px] items-center justify-center rounded-xl border border-labBorder bg-[#060606] p-4 text-xs text-labMuted">
        3D preview unavailable in this browser/runtime.
      </div>
    );
  }

  if (availability === "error") {
    return (
      <div className="flex h-[470px] items-center justify-center rounded-xl border border-labBorder bg-[#060606] p-4 text-xs text-labMuted">
        3D preview failed to initialize.
      </div>
    );
  }

  return (
    <div className="relative h-[470px] w-full overflow-hidden rounded-xl border border-labBorder bg-[#060606]">
      <div ref={containerRef} className="h-full w-full" />
      {availability === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-labMuted">Initializing 3D preview...</div>
      )}
    </div>
  );
}
