import { useEffect, useMemo, useState } from "react";
import {
  BoardCollaborator,
  listBoardCollaborators,
} from "../services/collaboratorRepository";

export const useBoardCollaborators = (boardId: string | null) => {
  const [collaborators, setCollaborators] = useState<BoardCollaborator[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!boardId) return;
    let active = true;
    void listBoardCollaborators(boardId)
      .then((people) => active && setCollaborators(people))
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Collaborators could not be loaded.");
      });
    return () => { active = false; };
  }, [boardId]);

  return useMemo(() => ({ collaborators, error }), [collaborators, error]);
};
