import type { IrisDiskParams } from "@/types";
import { n, scadHeader } from "@/lib/scad/utils";

export function generateIrisDiskScad(params: IrisDiskParams): string {
  const tabEnabled = Boolean(params.tabEnabled);
  const tabWidth = params.tabWidthMm ?? 6;
  const tabLength = params.tabLengthMm ?? 8;

  if (params.isOval) {
    const ovalWidth = params.ovalWidthMm ?? params.apertureDiameterMm;
    const ovalHeight = params.ovalHeightMm ?? params.apertureDiameterMm;

    return `${scadHeader(params.partName, params.facets)}disk_diameter = ${n(params.diskDiameterMm)};
thickness = ${n(params.thicknessMm)};
oval_width = ${n(ovalWidth)};
oval_height = ${n(ovalHeight)};
tab_enabled = ${tabEnabled ? "true" : "false"};
tab_width = ${n(tabWidth)};
tab_length = ${n(tabLength)};

module oval_hole() {
  scale([oval_width / oval_height, 1, 1])
    cylinder(h = thickness + 0.2, d = oval_height);
}

module iris_body() {
  union() {
    cylinder(h = thickness, d = disk_diameter);
    if (tab_enabled) {
      translate([disk_diameter / 2, -tab_width / 2, 0])
        cube([tab_length, tab_width, thickness]);
    }
  }
}

difference() {
  iris_body();
  translate([0, 0, -0.1])
    oval_hole();
}
`;
  }

  return `${scadHeader(params.partName, params.facets)}disk_diameter = ${n(params.diskDiameterMm)};
aperture_diameter = ${n(params.apertureDiameterMm)};
thickness = ${n(params.thicknessMm)};
tab_enabled = ${tabEnabled ? "true" : "false"};
tab_width = ${n(tabWidth)};
tab_length = ${n(tabLength)};

module iris_body() {
  union() {
    cylinder(h = thickness, d = disk_diameter);
    if (tab_enabled) {
      translate([disk_diameter / 2, -tab_width / 2, 0])
        cube([tab_length, tab_width, thickness]);
    }
  }
}

difference() {
  iris_body();
  translate([0, 0, -0.1])
    cylinder(h = thickness + 0.2, d = aperture_diameter);
}
`;
}
