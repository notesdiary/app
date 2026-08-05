export type Route = { name: 'picker' } | { name: 'project'; projectId: string };

export function parseHash(hash: string): Route {
  const match = hash.match(/^#\/project\/(.+)$/);
  if (match) return { name: 'project', projectId: decodeURIComponent(match[1]) };
  return { name: 'picker' };
}

export function navigateToPicker(): void {
  window.location.hash = '#/';
}

export function navigateToProject(projectId: string): void {
  window.location.hash = `#/project/${encodeURIComponent(projectId)}`;
}
