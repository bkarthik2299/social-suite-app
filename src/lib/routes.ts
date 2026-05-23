type NamedEntity = {
  id: string;
  name: string | null;
};

const DEFAULT_SEGMENT = "untitled";

export function slugify(value: string | null | undefined): string {
  const slug = (value || DEFAULT_SEGMENT)
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || DEFAULT_SEGMENT;
}

export function slugForEntity<T extends NamedEntity>(entity: T, peers: T[] = []): string {
  const base = slugify(entity.name);
  const sameBase = peers.filter((peer) => slugify(peer.name) === base);

  if (sameBase.length <= 1) return base;

  const index = sameBase.findIndex((peer) => peer.id === entity.id);
  return index <= 0 ? base : `${base}-${index + 1}`;
}

export function findBySlug<T extends NamedEntity>(entities: T[] | undefined, slug: string | undefined): T | undefined {
  if (!entities || !slug) return undefined;
  return entities.find((entity) => slugForEntity(entity, entities) === slug);
}

export function projectPath<T extends NamedEntity>(project: T, projects: T[] = []): string {
  return `/projects/${slugForEntity(project, projects)}/folders`;
}

export function folderPath<P extends NamedEntity, F extends NamedEntity>(
  project: P,
  folder: F,
  projects: P[] = [],
  folders: F[] = [],
): string {
  return `/projects/${slugForEntity(project, projects)}/folders/${slugForEntity(folder, folders)}/campaigns`;
}

export function campaignPath<P extends NamedEntity, F extends NamedEntity, C extends NamedEntity>(
  project: P,
  folder: F,
  campaign: C,
  projects: P[] = [],
  folders: F[] = [],
  campaigns: C[] = [],
): string {
  return `${folderPath(project, folder, projects, folders)}/${slugForEntity(campaign, campaigns)}`;
}
