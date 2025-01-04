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
  return (
    <div
      style={{
        position: "absolute",
        top: `${(hoverStartY - window.y1) / window.percentZoomed}px`,
        left: `${(hoverStartX - window.x1) / window.percentZoomed}px`,
        width: `${(hoverEndX - hoverStartX) / window.percentZoomed}px`,
        height: `${(hoverEndY - hoverStartY) / window.percentZoomed}px`,
        border: `${2 / window.percentZoomed}px solid #007bff`,
      }}
    />
  );
};

export default RenderHoverBorder;
