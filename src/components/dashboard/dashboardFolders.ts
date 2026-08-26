import type { WorkspaceFolder } from "../../services/productRepository";

export const orderWorkspaceFolders = (folders: WorkspaceFolder[]) => {
  const byParent = new Map<string | null, WorkspaceFolder[]>();
  const ids = new Set(folders.map((folder) => folder.id));
  folders.forEach((folder) => {
    const parentId = folder.parent_id && ids.has(folder.parent_id) ? folder.parent_id : null;
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), folder]);
  });
  byParent.forEach((items) => items.sort((left, right) => left.name.localeCompare(right.name)));
  const ordered: WorkspaceFolder[] = [];
  const visited = new Set<string>();
  const visit = (parentId: string | null) => (byParent.get(parentId) ?? []).forEach((folder) => {
    if (visited.has(folder.id)) return;
    visited.add(folder.id);
    ordered.push(folder);
    visit(folder.id);
  });
  visit(null);
  folders.forEach((folder) => { if (!visited.has(folder.id)) { visited.add(folder.id); ordered.push(folder); visit(folder.id); } });
  return ordered;
};
