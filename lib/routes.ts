export const STATIC_PROJECT_ROUTE_ID = "local";

function q(id: string): string {
  return encodeURIComponent(id);
}

export function projectDetailHref(projectId: string): string {
  return `/projects/${STATIC_PROJECT_ROUTE_ID}?projectId=${q(projectId)}`;
}

export function projectStackHref(projectId: string): string {
  return `/projects/${STATIC_PROJECT_ROUTE_ID}/stack?projectId=${q(projectId)}`;
}

export function projectCadHref(projectId: string): string {
  return `/projects/${STATIC_PROJECT_ROUTE_ID}/cad?projectId=${q(projectId)}`;
}

export function projectExperimentsHref(projectId: string): string {
  return `/projects/${STATIC_PROJECT_ROUTE_ID}/experiments?projectId=${q(projectId)}`;
}
