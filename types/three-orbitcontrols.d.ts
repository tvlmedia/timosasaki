declare module "three/examples/jsm/controls/OrbitControls" {
  import type { Camera, EventDispatcher, Vector3 } from "three";

  export class OrbitControls extends EventDispatcher {
    constructor(object: Camera, domElement?: HTMLElement);
    enabled: boolean;
    target: Vector3;
    enableDamping: boolean;
    dampingFactor: number;
    enableZoom: boolean;
    enablePan: boolean;
    screenSpacePanning: boolean;
    update(): void;
    dispose(): void;
  }
}

declare module "three/examples/jsm/controls/OrbitControls.js" {
  export { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
}
