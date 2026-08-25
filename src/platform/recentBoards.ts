export interface RecentBoardVisit {
  boardId: string;
  openedAt: number;
}

const MAX_RECENT_BOARDS = 32;

const storageKey = (userId: string) => `kumo:recent-boards:${userId}`;

export const recentBoardVisits = (
  userId: string | null | undefined,
  storage: Pick<Storage, "getItem"> = localStorage
): RecentBoardVisit[] => {
  if (!userId) return [];
  try {
    const parsed = JSON.parse(storage.getItem(storageKey(userId)) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed
      .filter((visit): visit is RecentBoardVisit => Boolean(visit)
        && typeof visit === "object"
        && typeof (visit as RecentBoardVisit).boardId === "string"
        && Boolean((visit as RecentBoardVisit).boardId)
        && typeof (visit as RecentBoardVisit).openedAt === "number"
        && Number.isFinite((visit as RecentBoardVisit).openedAt)
        && (visit as RecentBoardVisit).openedAt > 0)
      .sort((left, right) => right.openedAt - left.openedAt)
      .filter((visit) => {
        if (seen.has(visit.boardId)) return false;
        seen.add(visit.boardId);
        return true;
      })
      .slice(0, MAX_RECENT_BOARDS);
  } catch {
    return [];
  }
};

export const recordBoardVisit = (
  userId: string | null | undefined,
  boardId: string,
  openedAt = Date.now(),
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage
): RecentBoardVisit[] => {
  if (!userId || !boardId || !Number.isFinite(openedAt) || openedAt <= 0) {
    return recentBoardVisits(userId, storage);
  }
  const visits = [
    { boardId, openedAt },
    ...recentBoardVisits(userId, storage).filter((visit) => visit.boardId !== boardId),
  ].slice(0, MAX_RECENT_BOARDS);
  storage.setItem(storageKey(userId), JSON.stringify(visits));
  return visits;
};
