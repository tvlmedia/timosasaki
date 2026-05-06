export function n(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

export function scadHeader(partName: string, facets: number): string {
  return `// Timo Sasaki Lens Lab generated prototype CAD
// Part: ${partName}
// WARNING: Prototype geometry only. Check tolerances and dimensions before printing/machining.

$fn = ${Math.max(12, Math.round(facets))};

`;
}
