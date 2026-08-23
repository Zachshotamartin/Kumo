import { useEffect, useMemo, useState } from "react";
import {
  BoardCollaborator,
  listBoardCollaborators,
} from "../services/collaboratorRepository";

export const useBoardCollaborators = (boardId: string | null) => {
  const [state, setState] = useState<{
    boardId: string | null;
    collaborators: BoardCollaborator[];
    error: string | null;
  }>({ boardId: null, collaborators: [], error: null });

  useEffect(() => {
    if (!boardId) return;
    let active = true;
    void listBoardCollaborators(boardId)
      .then((people) => {
        if (active) setState({ boardId, collaborators: people, error: null });
      })
      .catch((caught) => {
        if (active) setState({
          boardId,
          collaborators: [],
          error: caught instanceof Error ? caught.message : "Collaborators could not be loaded.",
        });
      });
    return () => { active = false; };
  }, [boardId]);

  return useMemo(() => state.boardId === boardId
    ? { collaborators: state.collaborators, error: state.error }
    : { collaborators: [], error: null }, [boardId, state]);
};
