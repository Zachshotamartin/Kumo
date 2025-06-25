import { useSelector } from "react-redux";

const RenderHoverBorder = () => {
  const hoverStartX = useSelector(
    (state: any) => state.selected.hoverStartX
  ) as number;
  const hoverStartY = useSelector(
    (state: any) => state.selected.hoverStartY
  ) as number;
  const hoverEndX = useSelector(
    (state: any) => state.selected.hoverEndX
  ) as number;
  const hoverEndY = useSelector(
    (state: any) => state.selected.hoverEndY
  ) as number;
  const window = useSelector((state: any) => state.window);

  const mouseDown = useSelector((state: any) => state.actions.mouseDown);

  return (
    <>
      {!mouseDown && (
        <div
          style={{
            position: "absolute",
            top: `${
              (hoverStartY - window.y1) / window.percentZoomed +
              2 / window.percentZoomed -
              2
            }px`,
            left: `${
              (hoverStartX - window.x1) / window.percentZoomed +
              2 / window.percentZoomed -
              2
            }px`,
            width: `${(hoverEndX - hoverStartX) / window.percentZoomed + 4}px`,
            height: `${(hoverEndY - hoverStartY) / window.percentZoomed + 4}px`,
            border: `2px solid rgba(34, 197, 94, 0.6)`,
            backgroundColor: "rgba(34, 197, 94, 0.05)",
            borderRadius: "4px",
            boxShadow: "0 0 0 1px rgba(34, 197, 94, 0.2)",
            pointerEvents: "none",
            zIndex: 51,
            transition: "all 0.2s ease",
          }}
        />
      )}
    </>
  );
};

export default RenderHoverBorder;
