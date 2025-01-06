import { ChangeEvent, SetStateAction, useEffect, useState } from "react";
import styles from "./options.module.css";
import { useSelector, useDispatch } from "react-redux";
import { updateShape } from "../../features/whiteBoard/whiteBoardSlice";
const ImageStyling = () => {
  const dispatch = useDispatch();
  const selectedIdx = useSelector(
    (state: any) => state.selected.selectedShapes[0]
  );
  const selectedShape = useSelector((state: any) => state.whiteBoard.shapes)[
    selectedIdx
  ];
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files![0]);
  };

  useEffect(() => {
    if (selectedFile) {
      const reader = new FileReader();
      reader.onload = () => {
        dispatch(
          updateShape({
            index: selectedIdx,
            update: {
              backgroundImage:
                typeof reader.result === "string" ? reader.result : undefined,
            },
          })
        );
      };
      reader.readAsDataURL(selectedFile);
    }
  }, [selectedFile]);

  return (
    <div className={styles.container}>
      <h4 className={styles.optionHeader}>Image</h4>
      <div className={styles.labelInputGroup}>
        {selectedShape?.type === "image" && (
          <div className={styles.labelInput}>
            <h5 className={styles.label}>Select Image</h5>
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
