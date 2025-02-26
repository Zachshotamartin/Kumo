import { WindowState } from "../features/window/windowSlice";

export function changeCursor(
  x: number,
  y: number,
  e: React.MouseEvent<HTMLDivElement>,
  borderStartX: number,
  borderEndX: number,
  borderStartY: number,
  borderEndY: number,
  window: WindowState
): void {
  if (window.percentZoomed) {
    if (
      (x >= borderEndX - 10 / window.percentZoomed &&
        x <= borderEndX &&
        y <= borderEndY - 10 / window.percentZoomed &&
        y >= borderStartY + 10 / window.percentZoomed) ||
      (x >= borderStartX &&
        x <= borderStartX + 10 / window.percentZoomed &&
        y <= borderEndY - 10 / window.percentZoomed &&
        y >= borderStartY + 10 / window.percentZoomed)
    ) {
      (e.target as HTMLElement).style.cursor = "ew-resize";
    } else if (
      (y >= borderEndY - 10 / window.percentZoomed &&
        y <= borderEndY &&
        x <= borderEndX - 10 / window.percentZoomed &&
        x >= borderStartX + 10 / window.percentZoomed) ||
      (y >= borderStartY &&
        y <= borderStartY + 10 / window.percentZoomed &&
        x <= borderEndX - 10 / window.percentZoomed &&
        x >= borderStartX + 10 / window.percentZoomed)
    ) {
      (e.target as HTMLElement).style.cursor = "ns-resize";
    } else if (
      (x >= borderStartX &&
        x <= borderStartX + 10 / window.percentZoomed &&
        y >= borderStartY &&
        y <= borderStartY + 10 / window.percentZoomed) ||
      (x >= borderEndX - 10 / window.percentZoomed &&
        x <= borderEndX &&
        y >= borderEndY - 10 / window.percentZoomed &&
        y <= borderEndY)
    ) {
      (e.target as HTMLElement).style.cursor = "nwse-resize";
    } else if (
      (x >= borderStartX &&
        x <= borderStartX + 10 / window.percentZoomed &&
        y >= borderEndY - 10 / window.percentZoomed &&
        y <= borderEndY) ||
      (x >= borderEndX - 10 / window.percentZoomed &&
        x <= borderEndX &&
        y >= borderStartY &&
        y <= borderStartY + 10 / window.percentZoomed)
    ) {
      (e.target as HTMLElement).style.cursor = "nesw-resize";
    } else {
      (e.target as HTMLElement).style.cursor = "default";
    }
  }
}
