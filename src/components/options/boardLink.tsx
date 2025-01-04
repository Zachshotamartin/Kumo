import { useState } from "react";
import styles from "./options.module.css";
import { useSelector, useDispatch } from "react-redux";
import { updateShape } from "../../features/whiteBoard/whiteBoardSlice";
const BoardLink = () => {
  const dispatch = useDispatch();
  const selectedIdx = useSelector(
    (state: any) => state.selected.selectedShapes[0]
  );
  const selectedShape = useSelector((state: any) => state.whiteBoard.shapes)[
    selectedIdx
  ];
  const boardChoices = useSelector((state: any) => state.boards);
  const [selectedValue, setSelectedValue] = useState(
    selectedShape?.id || "none"
  );

  return (
    <div className={styles.container}>
      <h4 className={styles.optionHeader}>Board Link</h4>
      <div className={styles.labelInputGroup}>
        {selectedShape?.type === "board" && (
          <div className={styles.labelInput}>
            <h5 className={styles.label}>link</h5>
            <select
              className={styles.dropdown}
              value={selectedValue}
              onChange={async (e) => {
                const selectedBoardId = e.target.value;
                if (selectedBoardId === "none") {
                  return;
                }
                let selectedBoard = boardChoices.publicBoards.find(
                  (board: any) => board.id === selectedBoardId
                );
                if (!selectedBoard) {
                  selectedBoard = boardChoices.privateBoards.find(
                    (board: any) => board.id === selectedBoardId
                  );
                }
                if (!selectedBoard) {
                  selectedBoard = boardChoices.sharedBoards.find(
                    (board: any) => board.id === selectedBoardId
                  );
                }
                dispatch(
                  updateShape({
                    index: selectedIdx,
                    update: {
                      id: selectedBoard.id,
                      uid: selectedBoard.uid,
                      title: selectedBoard.title,
                    },
                  })
                );
                setSelectedValue(selectedBoardId);
              }}
            >
              <option value="none">none</option>
              {boardChoices.publicBoards.map((board: any, index: number) => (
                <option key={index} value={board.id}>
                  {board.title + " (public)"}
                </option>
              ))}
              {boardChoices.privateBoards.map((board: any, index: number) => (
                <option key={index} value={board.id}>
                  {board.title + " (private)"}
                </option>
              ))}
              {boardChoices.sharedBoards.map((board: any, index: number) => (
                <option key={index} value={board.id}>
                  {board.title + " (shared)"}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
};

export default BoardLink;
