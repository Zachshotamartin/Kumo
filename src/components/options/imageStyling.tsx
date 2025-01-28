import { ChangeEvent, useEffect, useState } from "react";
import styles from "./options.module.css";
import { useSelector, useDispatch } from "react-redux";

import { handleBoardChange } from "../../helpers/handleBoardChange";
import {
  Shape,
  setWhiteboardData,
} from "../../features/whiteBoard/whiteBoardSlice";

const ImageStyling = () => {
  const dispatch = useDispatch();
  
  const board = useSelector((state: any) => state.whiteBoard);
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  let selectedShape: Shape | undefined;
  if (selectedShapes) {
    selectedShape = shapes.find(
      (shape: Shape, index: number) => shape.id === selectedShapes[0]
    );
  }
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files![0]);
  };

  useEffect(() => {
    if (selectedFile) {
      const reader = new FileReader();
      reader.onload = () => {
        dispatch(
          setWhiteboardData({
            ...board,
            shapes: [
              ...shapes.filter(
                (shape: Shape, index: number) => shape.id !== selectedShape?.id
              ),
              {
                ...selectedShape,
                backgroundImage:
                  typeof reader.result === "string" ? reader.result : undefined,
              },
            ],
          })
        );
        handleBoardChange({
          ...board,
          shapes: [
            ...shapes.filter(
              (shape: Shape, index: number) => shape.id !== selectedShape?.id
            ),
            {
              ...selectedShape,
              backgroundImage:
                typeof reader.result === "string" ? reader.result : undefined,
            },
          ],
        });
      };
      reader.readAsDataURL(selectedFile);
    }
  }, [selectedFile]);

  return (
    <div className={styles.container}>
      <h6 className={styles.optionHeader}>Image</h6>
      <div className={styles.labelInputGroup}>
        {selectedShape?.type === "image" && (
          <div className={styles.labelInput}>
            <h6 className={styles.label}>Select Image</h6>
            <input type="file" onChange={handleFileChange} />
            {selectedFile && (
              <div>
                <p>Selected file: {selectedFile.name}</p>
                <p>File size: {selectedFile.size} bytes</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageStyling;
