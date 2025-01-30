import React from "react";
import styles from "./contextMenu.module.css";

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  labels: { label: string; onClick: () => void }[];
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose, labels }) => {
  return (
    <div
      className={styles.contextMenu}
      style={{ left: x, top: y }}
      id="contextMenu"
    >
      <ul >
        {labels.map(
          (label: { label: string; onClick: () => void }, index: number) => (
            <li
              key={index}
              
              onClick={(event) => {
        

                // event.stopPropagation();
                label.onClick();
                onClose();
              }}
            >
              {label.label}
            </li>
          )
        )}
      </ul>
    </div>
  );
};

export default ContextMenu;
