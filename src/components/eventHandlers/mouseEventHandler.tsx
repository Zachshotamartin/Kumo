import React, { useState, useRef, useEffect, useCallback } from "react";
import { throttle, debounce } from "lodash";
import { useSelector, useDispatch } from "react-redux";
import { removeShape } from "../../features/whiteBoard/whiteBoardSlice";
import { setWindow, WindowState } from "../../features/window/windowSlice";
import { Shape } from "../../classes/shape";
import { realtimeDb } from "../../config/firebase";
import { AppDispatch } from "../../store";
import { ShapeFunctions } from "../../classes/shape";
import { changeCursor } from "../../helpers/cursorHelper";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import {
  setDrawing,
  setDragging,
  setDoubleClicking,
  setMoving,
  setHighlighting,
  setResizing,
  setResizingLeft,
  setResizingRight,
  setResizingTop,
  setResizingBottom,
  setMouseDown,
  setGridSnappedX,
  setGridSnappedY,
  setGridSnappedDistanceX,
  setGridSnappedDistanceY,
  setMiddleMouseButton,
} from "../../features/actions/actionsSlice";
import {
  setSelectedShapes,
  setSelectedTool,
  clearSelectedShapes,
  setHighlightStart,
  setHighlightEnd,
} from "../../features/selected/selectedSlice";

import { undo, redo } from "../../features/shapeHistory/shapeHistorySlice";
import { handleBoardChange } from "../../helpers/handleBoardChange";
import { ref, onValue, update } from "firebase/database"; // For listening to Realtime Database

import WhiteBoard from "../whiteBoard/whiteBoard";
import ContextMenu from "../contextMenu/contextMenu";

const MouseEventHandler = () => {
  const dispatch = useDispatch<AppDispatch>();
  const actionsDispatch = useDispatch();

  // Selected Selectors //
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const selectedTool = useSelector((state: any) => state.selected.selectedTool);
  const borderStartX = useSelector((state: any) => state.selected.borderStartX);
  const borderStartY = useSelector((state: any) => state.selected.borderStartY);
  const borderEndX = useSelector((state: any) => state.selected.borderEndX);
  const borderEndY = useSelector((state: any) => state.selected.borderEndY);

  // WhiteBoard Selectors //
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const board = useSelector((state: any) => state.whiteBoard);

  // Window Selectors //
  const window = useSelector((state: any) => state.window);

  // History Selectors //
  const history = useSelector((state: any) => state.shapeHistory);

  // Authentication Selectors //
  const user = useSelector((state: any) => state.auth);

  // Actions Selectors //
  const drawing = useSelector((state: any) => state.actions.drawing);
  const dragging = useSelector((state: any) => state.actions.dragging);
  const resizing = useSelector((state: any) => state.actions.resizing);
  const resizingLeft = useSelector((state: any) => state.actions.resizingLeft);
  const resizingRight = useSelector(
    (state: any) => state.actions.resizingRight
  );
  const resizingTop = useSelector((state: any) => state.actions.resizingTop);
  const resizingBottom = useSelector(
    (state: any) => state.actions.resizingBottom
  );
  const moving = useSelector((state: any) => state.actions.moving);
  const highlighting = useSelector((state: any) => state.actions.highlighting);

  const gridSnappedX = useSelector((state: any) => state.actions.gridSnappedX);
  const gridSnappedY = useSelector((state: any) => state.actions.gridSnappedY);
  const gridSnappedDistanceX = useSelector(
    (state: any) => state.actions.gridSnappedDistanceX
  );
  const gridSnappedDistanceY = useSelector(
    (state: any) => state.actions.gridSnappedDistanceY
  );
  const middleMouseButton = useSelector(
    (state: any) => state.actions.middleMouseButton
  );

  // UseStates //
  const [prevMouseX, setPrevMouseX] = useState(0);
  const [prevMouseY, setPrevMouseY] = useState(0);
  const [prevMouseXAbsolute, setPrevMouseXAbsolute] = useState(0);
  const [prevMouseYAbsolute, setPrevMouseYAbsolute] = useState(0);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null
  ); // Offset between cursor and shape position
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextMenuX, setContextMenuX] = useState(0);
  const [contextMenuY, setContextMenuY] = useState(0);
  const [contextMenuLabels, setContextMenuLabels] = useState<
    { label: string; onClick: () => void }[]
  >([]);
  const [middle, setMiddle] = useState(false);

  // Use Refs //
  const canvasRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Realtime DB
  // const usersCollectionRef = collection(db, "users");

  /*
    Middle Mouse Triggered UseEffect:
    Responsibility -> To allow checking if the middle mouse button is pressed down.
  */
  useEffect(() => {
    setMiddle(middleMouseButton);
    console.log("middle", middleMouseButton);
  }, [middleMouseButton]);

  const getMousePosition = (e: React.MouseEvent<HTMLDivElement>) => {
    const boundingRect = canvasRef.current?.getBoundingClientRect();
    const x = Math.round(
      (e.clientX - (boundingRect?.left ?? 0)) * window.percentZoomed + window.x1
    );
    const y = Math.round(
      (e.clientY - (boundingRect?.top ?? 0)) * window.percentZoomed + window.y1
    );
    setPrevMouseX(x);
    setPrevMouseY(y);

    return { x, y };
  };
  const getMousePositionAbsolute = (e: React.MouseEvent<HTMLDivElement>) => {
    const boundingRect = canvasRef.current?.getBoundingClientRect();
    const xAbs = Math.round(
      (e.clientX - (boundingRect?.left ?? 0)) * window.percentZoomed
    );
    const yAbs = Math.round(
      (e.clientY - (boundingRect?.top ?? 0)) * window.percentZoomed
    );
    setPrevMouseXAbsolute(xAbs);
    setPrevMouseYAbsolute(yAbs);

    return { xAbs, yAbs };
  };
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const { x, y } = getMousePosition(e);
    const { xAbs, yAbs } = getMousePositionAbsolute(e);
    if (e.button === 1) {
      actionsDispatch(setMiddleMouseButton(true));

      setDragOffset({ x: 0, y: 0 });
    } else if (e.button === 0) {
      const target = e.target as HTMLElement;
      if (target.closest("button")) {
        return; // Ignore clicks on buttons
      }
      if (
        document.getElementById("contextMenu") === target ||
        document.getElementById("contextMenu")?.contains(target)
      ) {
        return;
      } else {
        if (contextMenuVisible) {
          setContextMenuVisible(false);
        }
      }
      actionsDispatch(setMouseDown(true));

      if (selectedTool === "pointer") {
        let selected: string = "";
        let intersects = [];
        for (let i = 0; i < shapes.length; i++) {
          let shape = shapes[i];
          if (
            x >= Math.min(shape.x1, shape.x2) &&
            x <= Math.max(shape.x1, shape.x2) &&
            y >= Math.min(shape.y1, shape.y2) &&
            y <= Math.max(shape.y1, shape.y2)
          ) {
            // if cursor is within a shape.
            intersects.push(shape);

            actionsDispatch(setDrawing(false));
          }
        }
        console.log(intersects);
        if (intersects.length > 0) {
          selected = intersects.reduce((largest: Shape, shape: Shape) => {
            return shape.zIndex > largest.zIndex ? shape : largest;
          }).id;
          if (e.shiftKey) {
            if (!selectedShapes.includes(selected)) {
              dispatch(setSelectedShapes([...selectedShapes, selected]));
            }
          }
        }

        if (selectedShapes.length > 0) {
          if (
            x < Math.min(borderStartX, borderEndX) ||
            x > Math.max(borderStartX, borderEndX) ||
            y < Math.min(borderStartY, borderEndY) ||
            y > Math.max(borderStartY, borderEndY)
          ) {
            // if cursor is outside the bounding box
            dispatch(clearSelectedShapes());
            actionsDispatch(setHighlighting(false));
          }

          let resizing = false;
          if (selectedShapes.length > 0) {
            if (
              x >= borderEndX - 10 / window.percentZoomed &&
              x <= borderEndX &&
              y <= borderEndY &&
              y >= borderStartY
            ) {
              resizing = true;
              actionsDispatch(setResizingRight(true));
            }
            if (
              x >= borderStartX &&
              x <= borderStartX + 10 / window.percentZoomed &&
              y <= borderEndY &&
              y >= borderStartY
            ) {
              resizing = true;
              actionsDispatch(setResizingLeft(true));
            }
            if (
              y >= borderEndY - 10 / window.percentZoomed &&
              y <= borderEndY &&
              x <= borderEndX &&
              x >= borderStartX
            ) {
              resizing = true;
              actionsDispatch(setResizingBottom(true));
            }
            if (
              y >= borderStartY &&
              y <= borderStartY + 10 / window.percentZoomed &&
              x <= borderEndX &&
              x >= borderStartX
            ) {
              resizing = true;
              actionsDispatch(setResizingTop(true));
            }
            if (
              x >= borderStartX + 10 / window.percentZoomed &&
              x <= borderEndX - 10 / window.percentZoomed &&
              y >= borderStartY + 10 / window.percentZoomed &&
              y <= borderEndY - 10 / window.percentZoomed
            ) {
              actionsDispatch(setDragging(true));
              actionsDispatch(setMoving(true));
              setDragOffset({ x: 0, y: 0 });
              return;
            }
            if (resizing) {
              // if cursor is on the border of the bounding box to resize shape
              actionsDispatch(setResizing(true));

              setDragOffset({ x: 0, y: 0 });
              actionsDispatch(setDragging(true));

              return;
            }
          }
        }

        if (selected) {
          // if something is selected

          setDragOffset({ x: 0, y: 0 });
          actionsDispatch(setDragging(true));
          actionsDispatch(setMoving(true));

          if (!selectedShapes.includes(selected)) {
            // if something is selected but not already within the bounding box
            if (e.shiftKey) {
              dispatch(setSelectedShapes([...selectedShapes, selected]));
            }
            if (!e.shiftKey) {
              dispatch(setSelectedShapes([selected]));
            }
          }
        } else {
          if (
            x > Math.min(borderStartX, borderEndX) &&
            x < Math.max(borderStartX, borderEndX) &&
            y > Math.min(borderStartY, borderEndY) &&
            y < Math.max(borderStartY, borderEndY)
          ) {
            // if nothing is selected but cursor is still in the selected bounding box

            setDragOffset({ x: 0, y: 0 });
            actionsDispatch(setDragging(true));
            actionsDispatch(setMoving(true));
          } else {
            // if nothing is selected
            dispatch(clearSelectedShapes());

            actionsDispatch(setDragging(true));
            actionsDispatch(setHighlighting(true));

            dispatch(setHighlightStart([x, y]));
            dispatch(setHighlightEnd([x, y]));
          }
        }
        return;
      }

      actionsDispatch(setDrawing(true));

      if (
        selectedTool === "rectangle" ||
        selectedTool === "ellipse" ||
        selectedTool === "text" ||
        selectedTool === "calendar" ||
        selectedTool === "image"
      ) {
        let shape = ShapeFunctions.createShape(selectedTool, x, y, shapes);

        const data = {
          ...board,
          shapes: [...shapes, shape],
          currentUsers: [
            ...(board.currentUsers || []).filter(
              (curUser: any) => curUser?.user !== user.uid
            ),
            { user: user.uid, cursorX: x, cursorY: y },
          ],
        };

        dispatch(setWhiteboardData(data));
        handleBoardChange(data);
        dispatch(setSelectedShapes([shape.id]));
      }
    }
  };
  const debouncedMouseMove = useCallback(
    throttle(
      debounce((e: React.MouseEvent<HTMLDivElement>) => {
        const selectedShapesArray = shapes.filter(
          (shape: Shape, index: number) => {
            return selectedShapes.includes(shape.id);
          }
        );

        const { x, y } = getMousePosition(e);

        const { xAbs, yAbs } = getMousePositionAbsolute(e);

        if (selectedShapesArray.length > 0) {
          changeCursor(
            x,
            y,
            e,
            borderStartX,
            borderEndX,
            borderStartY,
            borderEndY,
            window
          );
        }

        if (dragging && moving) {
          if (dragOffset) {
            const updatedShapes: Shape[] = [];
            selectedShapesArray.forEach((shape: Shape, index: number) => {
              let offsetX = x - prevMouseX;
              let offsetY = y - prevMouseY;

              if (gridSnappedX) {
                actionsDispatch(
                  setGridSnappedDistanceX(offsetX + gridSnappedDistanceX)
                );
                offsetX = 0;
              }
              if (gridSnappedY) {
                actionsDispatch(
                  setGridSnappedDistanceY(offsetY + gridSnappedDistanceY)
                );
                offsetY = 0;
              }
              updatedShapes.push(
                ShapeFunctions.moveShape(shape, offsetX, offsetY)
              );
            });
            const data = {
              ...board,
              shapes: [
                ...board.shapes.filter((shape: Shape, index: number) => {
                  return !selectedShapes.includes(shape.id);
                }),
                ...updatedShapes,
              ],

              currentUsers: [
                ...(board.currentUsers || []).filter(
                  (curUser: any) => curUser?.user !== user.uid
                ),
                { user: user.uid, cursorX: x, cursorY: y },
              ],
              lastChangedBy: user.uid,
            };
            dispatch(setWhiteboardData(data));

            handleBoardChange(data);
          }
          if (
            gridSnappedX &&
            (gridSnappedDistanceX / window.percentZoomed >= 5 ||
              gridSnappedDistanceX / window.percentZoomed <= -5)
          ) {
            actionsDispatch(setGridSnappedX(false));
            actionsDispatch(setGridSnappedDistanceX(0));
          }
          if (
            gridSnappedY &&
            (gridSnappedDistanceY / window.percentZoomed >= 5 ||
              gridSnappedDistanceY / window.percentZoomed <= -5)
          ) {
            actionsDispatch(setGridSnappedY(false));
            actionsDispatch(setGridSnappedDistanceY(0));
          }
        }

        if (dragging && highlighting) {
          dispatch(setHighlightEnd([x, y]));
        }

        if (dragging && resizing) {
          let updatedShapes: Shape[] = [];
          selectedShapesArray.forEach((shape: Shape, index: number) => {
            let offsetX = x - prevMouseX;
            let offsetY = y - prevMouseY;

            if (gridSnappedX) {
              actionsDispatch(
                setGridSnappedDistanceX(offsetX + gridSnappedDistanceX)
              );
              offsetX = 0;
            }
            if (gridSnappedY) {
              actionsDispatch(
                setGridSnappedDistanceY(offsetY + gridSnappedDistanceY)
              );
              offsetY = 0;
            }

            updatedShapes.push(
              ShapeFunctions.resizeShape(
                shape,
                borderStartX,
                borderEndX,
                borderStartY,
                borderEndY,
                offsetX,
                offsetY,
                resizingTop,
                resizingBottom,
                resizingLeft,
                resizingRight
              )
            );
          });
          const data = {
            ...board,
            shapes: [
              ...board.shapes.filter((shape: Shape, index: number) => {
                return !selectedShapes.includes(shape.id);
              }),
              ...updatedShapes,
            ],
            currentUsers: [
              ...(board.currentUsers || []).filter(
                (curUser: any) => curUser?.user !== user.uid
              ),
              { user: user.uid, cursorX: x, cursorY: y },
            ],
          };
          dispatch(setWhiteboardData(data));
          handleBoardChange(data);
          if (
            gridSnappedX &&
            (gridSnappedDistanceX / window.percentZoomed >= 5 ||
              gridSnappedDistanceX / window.percentZoomed <= -5)
          ) {
            actionsDispatch(setGridSnappedX(false));
            actionsDispatch(setGridSnappedDistanceX(0));
          }
          if (
            gridSnappedY &&
            (gridSnappedDistanceY / window.percentZoomed >= 5 ||
              gridSnappedDistanceY / window.percentZoomed <= -5)
          ) {
            actionsDispatch(setGridSnappedY(false));
            actionsDispatch(setGridSnappedDistanceY(0));
          }
        }

        if (drawing) {
          const lastShape = shapes[shapes.length - 1];
          let offsetX = x - lastShape.x2;
          let offsetY = y - lastShape.y2;
          if (gridSnappedX) {
            actionsDispatch(
              setGridSnappedDistanceX(offsetX + gridSnappedDistanceX)
            );
            offsetX = 0;
          }
          if (gridSnappedY) {
            actionsDispatch(
              setGridSnappedDistanceY(offsetY + gridSnappedDistanceY)
            );
            offsetY = 0;
          }

          let updatedShape = ShapeFunctions.updateShape(lastShape, {
            x2: lastShape.x2 + offsetX,
            y2: lastShape.y2 + offsetY,
            width: Math.abs(lastShape.x2 + offsetX - lastShape.x1),
            height: Math.abs(lastShape.y2 + offsetY - lastShape.y1),
            rotation: 0,
          });
          const data = {
            ...board,
            shapes: [...board.shapes.slice(0, shapes.length - 1), updatedShape],
            currentUsers: [
              ...(board.currentUsers || []).filter(
                (curUser: any) => curUser?.user !== user.uid
              ),
              { user: user.uid, cursorX: x, cursorY: y },
            ],
          };
          dispatch(setWhiteboardData(data));
          handleBoardChange(data);

          if (
            gridSnappedX &&
            (gridSnappedDistanceX / window.percentZoomed >= 5 ||
              gridSnappedDistanceX / window.percentZoomed <= -5)
          ) {
            actionsDispatch(setGridSnappedX(false));
            actionsDispatch(setGridSnappedDistanceX(0));
          }
          if (
            gridSnappedY &&
            (gridSnappedDistanceY / window.percentZoomed >= 5 ||
              gridSnappedDistanceY / window.percentZoomed <= -5)
          ) {
            actionsDispatch(setGridSnappedY(false));
            actionsDispatch(setGridSnappedDistanceY(0));
          }
        }
      }, 10),
      10
    ), // Adjust the throttle delay (100ms in this case)
    [dragging, selectedShapes, dragOffset, shapes, drawing, canvasRef, dispatch]
  );
  const debouncedMiddleMouseMove = useCallback(
    throttle(
      debounce((e: React.MouseEvent<HTMLDivElement>) => {
        console.log("middle mouse called");
        let { xAbs, yAbs } = getMousePositionAbsolute(e);

        let offsetX = xAbs - prevMouseXAbsolute;
        let offsetY = yAbs - prevMouseYAbsolute;

        const deltaX = offsetX;
        const deltaY = offsetY;

        const newWindow: WindowState = {
          x1: window.x1 - deltaX,
          y1: window.y1 - deltaY,
          x2: window.x2 - deltaX,
          y2: window.y2 - deltaY,
          percentZoomed: window.percentZoomed,
        };
        dispatch(setWindow(newWindow));
      }, 1),
      1
    ),
    [prevMouseX, prevMouseY, dispatch, window]
  );
  // Use the throttled version in the event listener
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!middle) {
      debouncedMouseMove(e);
    } else if (middle) {
      debouncedMiddleMouseMove(e);
    }
  };
  const handleMouseUp = () => {
    if (!middleMouseButton) {
      actionsDispatch(setMouseDown(false));
      actionsDispatch(setDrawing(false));
      actionsDispatch(setDragging(false));
      setDragOffset(null);
      if (selectedTool === "text") {
        setTimeout(() => {
          actionsDispatch(setHighlighting(false));
          actionsDispatch(setMoving(false));
        }, 10);

        inputRef?.current?.focus();
      }

      actionsDispatch(setSelectedTool("pointer"));
      actionsDispatch(setHighlighting(false));
      actionsDispatch(setMoving(false));
      actionsDispatch(setResizing(false));
      actionsDispatch(setResizingLeft(false));
      actionsDispatch(setResizingRight(false));
      actionsDispatch(setResizingTop(false));
      actionsDispatch(setResizingBottom(false));
      dispatch(setSelectedShapes(selectedShapes));
    } else {
      actionsDispatch(setMiddleMouseButton(false));
    }
  };
  const handleDoubleClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    console.log("double click");
    actionsDispatch(setDoubleClicking(true));

    const { x, y } = getMousePosition(e);
    const { xAbs, yAbs } = getMousePositionAbsolute(e);

    if (selectedTool !== "pointer") {
      actionsDispatch(setDoubleClicking(false));
      return;
    }

    const selectedShape = shapes
      .slice()
      .reverse()
      .find(
        (shape: Shape) =>
          x >= Math.min(shape.x1, shape.x2) &&
          x <= Math.max(shape.x1, shape.x2) &&
          y >= Math.min(shape.y1, shape.y2) &&
          y <= Math.max(shape.y1, shape.y2)
      );

    if (!selectedShape?.boardId) {
      dispatch(clearSelectedShapes());
      actionsDispatch(setDoubleClicking(false));
      return;
    }

    const nextBoardId = selectedShape.boardId;
    const nextBoardRef = ref(realtimeDb, `boards/${nextBoardId}`);
    const curBoardRef = ref(realtimeDb, `boards/${board.id}`);

    if (!board?.id || typeof board.id !== "string") {
      console.error("Invalid current board ID:", board?.id);
      actionsDispatch(setDoubleClicking(false));
      return;
    }

    try {
      onValue(nextBoardRef, (snapshot) => {
        if (!snapshot.exists()) {
          console.error(`No data found for board ID: ${nextBoardId}`);
          actionsDispatch(setDoubleClicking(false));
          return;
        }

        const boardData = snapshot.val();
        if (!boardData || typeof boardData !== "object") {
          console.error("Invalid board data:", boardData);
          actionsDispatch(setDoubleClicking(false));
          return;
        }

        const useruid = localStorage.getItem("user");
        const updatedCurrentUsers =
          board.currentUsers?.filter(
            (curUser: any) => curUser.user !== useruid
          ) || [];

        const updatedCurrentBoard = {
          ...board,
          lastChangedBy: user?.uid,
          currentUsers: updatedCurrentUsers,
        };

        console.log("Switching to board:", nextBoardId, boardData);

        update(curBoardRef, updatedCurrentBoard);
        dispatch(clearSelectedShapes());
        dispatch(setWhiteboardData({ ...boardData, id: nextBoardId }));

        actionsDispatch(setDoubleClicking(false));
      });
    } catch (error) {
      console.error("Error switching boards:", error);
      actionsDispatch(setDoubleClicking(false));
    }
  };
  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const deltaY = event.deltaY;

    if (event.metaKey || event.ctrlKey) {
      // Zoom logic
      const zoomFactor = deltaY > 0 ? 1.1 : 0.9;

      const { x, y } = getMousePosition(event);
      const { xAbs, yAbs } = getMousePositionAbsolute(event);
      const cursorX = x;
      const cursorY = y;
      if (
        window.percentZoomed * zoomFactor < 4 &&
        window.percentZoomed * zoomFactor > 0.05
      ) {
        const newWindow: WindowState = {
          x1: Math.round(cursorX - (cursorX - window.x1) * zoomFactor),
          y1: Math.round(cursorY - (cursorY - window.y1) * zoomFactor),
          x2: Math.round(cursorX + (window.x2 - cursorX) * zoomFactor),
          y2: Math.round(cursorY + (window.y2 - cursorY) * zoomFactor),
          percentZoomed: Math.round(window.percentZoomed * zoomFactor),
        };
        dispatch(setWindow(newWindow));
      } else if (window.percentZoomed * zoomFactor > 2) {
        const newWindow: WindowState = {
          x1: Math.round(cursorX - (cursorX - window.x1)),
          y1: Math.round(cursorY - (cursorY - window.y1)),
          x2: Math.round(cursorX + (window.x2 - cursorX)),
          y2: Math.round(cursorY + (window.y2 - cursorY)),
          percentZoomed: Math.round(window.percentZoomed),
        };
        dispatch(setWindow(newWindow));
      } else {
        const newWindow: WindowState = {
          x1: Math.round(cursorX - (cursorX - window.x1)),
          y1: Math.round(cursorY - (cursorY - window.y1)),
          x2: Math.round(cursorX + (window.x2 - cursorX)),
          y2: Math.round(cursorY + (window.y2 - cursorY)),
          percentZoomed: Math.round(window.percentZoomed),
        };
        dispatch(setWindow(newWindow));
      }
    } else {
      // Pan logic
      const deltaX = event.deltaX * window.percentZoomed;
      const deltaY = event.deltaY * window.percentZoomed;

      const newWindow: WindowState = {
        x1: window.x1 + deltaX,
        y1: window.y1 + deltaY,
        x2: window.x2 + deltaX,
        y2: window.y2 + deltaY,
        percentZoomed: window.percentZoomed,
      };
      dispatch(setWindow(newWindow));
    }
  };
  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    let { x, y } = getMousePosition(event);
    x += window.x1;
    y += window.y1;
    let contextMenuLabels: { label: string; onClick: () => void }[] = [];

    // const target = event.target as HTMLElement;

    if (
      x > borderStartX &&
      x < borderEndX &&
      y > borderStartY &&
      y < borderEndY
    ) {
      contextMenuLabels = [
        {
          label: "delete",
          onClick: () => {
            event.preventDefault();
            if (selectedShapes.length > 0) {
              const shapesCopy = shapes.filter(
                (shape: Shape, index: number) => {
                  return selectedShapes.includes(shape.id);
                }
              );
              shapesCopy.forEach((shape: Shape) => {
                dispatch(removeShape(shape));
              });
              dispatch(clearSelectedShapes());
            }
          },
        },
        {
          label: "copy",
          onClick: () => {
            const copiedData = selectedShapes.map((index: number) => {
              return shapes[index];
            });
            navigator.clipboard.writeText(JSON.stringify(copiedData));
          },
        },
        {
          label: "move to top",
          onClick: () => {
            const startShape = shapes.find(
              (shape: Shape) => shape.id === selectedShapes[0]
            );
            if (!startShape) return;
            const startIndex = startShape.zIndex;
            const endShape = shapes.reduce((prev: Shape, current: Shape) => {
              return (prev.zIndex ?? 0) > (current.zIndex ?? 0)
                ? prev
                : current;
            });

            let shapeSize = 1;
            if (startShape.type === "component") {
              shapeSize += startShape.shapes.length;
            }

            const endIndex =
              (endShape.zIndex ?? 0) -
              shapeSize +
              (endShape.type !== "component"
                ? 1
                : 1 + startShape.shapes.length);

            let newShapes: Shape[] = [];

            shapes.forEach((shape: Shape) => {
              if (startIndex !== null) {
                if ((shape.zIndex ?? 0) < startIndex) {
                  newShapes.push(shape);
                }
                if ((shape.zIndex ?? 0) === startIndex) {
                  if (shape.type !== "component") {
                    newShapes.push({
                      ...shape,
                      zIndex: endIndex,
                    });
                  } else {
                    newShapes.push({
                      ...shape,
                      zIndex: endIndex,
                      shapes: shape.shapes?.map((componentShape: Shape) => {
                        return {
                          ...componentShape,
                          zIndex:
                            endIndex +
                            (componentShape.zIndex ?? 0) -
                            (shape.zIndex ?? 0),
                        };
                      }),
                    });
                  }
                }
                if ((shape.zIndex ?? 0) > startIndex) {
                  if (shape.type !== "component") {
                    newShapes.push({
                      ...shape,
                      zIndex: (shape.zIndex ?? 0) - shapeSize,
                    });
                  } else {
                    newShapes.push({
                      ...shape,
                      zIndex: (shape.zIndex ?? 0) - shapeSize,
                      shapes: shape.shapes?.map((componentShape: Shape) => {
                        return {
                          ...componentShape,
                          zIndex: (componentShape.zIndex ?? 0) - shapeSize,
                        };
                      }),
                    });
                  }
                }
              }
            });
            const data = {
              ...board,
              shapes: newShapes,
              currentUsers: [
                ...(board.currentUsers || []).filter(
                  (curUser: any) => curUser?.user !== user.uid
                ),
                { user: user.uid, cursorX: x, cursorY: y },
              ],
            };
            dispatch(setWhiteboardData(data));
            handleBoardChange(data);

            dispatch(setSelectedShapes([endIndex]));
          },
        },
        {
          label: "move to bottom",
          onClick: () => {
            const startShape = shapes.find(
              (shape: Shape) => shape.id === selectedShapes[0]
            );
            if (!startShape) return;

            const startIndex = startShape.zIndex;
            if (startIndex === 0) return; // Already at the bottom

            let shapeSize = 1;
            if (startShape.type === "component") {
              shapeSize += startShape.shapes.length;
            }

            let newShapes: Shape[] = [];

            shapes.forEach((shape: Shape) => {
              if (shape.id === startShape.id) {
                // Move selected shape to zIndex = 0
                if (shape.type !== "component") {
                  newShapes.push({ ...shape, zIndex: 0 });
                } else {
                  newShapes.push({
                    ...shape,
                    zIndex: 0,
                    shapes: shape.shapes?.map((componentShape: Shape) => ({
                      ...componentShape,
                      zIndex: (componentShape.zIndex ?? 0) - startIndex, // Adjust nested shapes
                    })),
                  });
                }
              } else {
                // Shift all shapes above startIndex downwards
                if ((shape.zIndex ?? 0) < startIndex) {
                  newShapes.push({
                    ...shape,
                    zIndex: (shape.zIndex ?? 0) + shapeSize,
                  });
                } else {
                  newShapes.push(shape);
                }
              }
            });

            // Update board state
            const data = {
              ...board,
              shapes: newShapes,
              currentUsers: [
                ...(board.currentUsers || []).filter(
                  (curUser: any) => curUser?.user !== user.uid
                ),
                { user: user.uid, cursorX: x, cursorY: y },
              ],
            };
            dispatch(setWhiteboardData(data));

            handleBoardChange(data);

            dispatch(setSelectedShapes([0])); // Select shape at bottom
          },
        },
      ];

      if (
        shapes.filter((shape: Shape) => {
          return selectedShapes.includes(shape.id);
        })[0].type === "component"
      ) {
        contextMenuLabels.push({
          label: "unwrap component",
          onClick: () => {
            const data = {
              ...board,
              shapes: [
                ...shapes.filter((shape: Shape, index: number) => {
                  return shape.id !== selectedShapes[0];
                }),
                ...shapes.filter(
                  (shape: Shape) => shape.id === selectedShapes[0]
                )[0].shapes,
              ],
              currentUsers: [
                ...(board.currentUsers || []).filter(
                  (curUser: any) => curUser?.user !== user.uid
                ),
                { user: user.uid, cursorX: x, cursorY: y },
              ],
            };
            dispatch(setWhiteboardData(data));
            handleBoardChange(data);

            dispatch(clearSelectedShapes());
          },
        });
      } else {
        contextMenuLabels.push({
          label: "create component",
          onClick: () => {
            event.preventDefault();
            const selectedShapesArray = shapes.filter((shape: Shape) =>
              selectedShapes.includes(shape.id)
            );
            const hasComponent = selectedShapesArray.some(
              (shape: Shape) => shape.type === "component"
            );
            const shapesCopy = shapes.filter((shape: Shape, index: number) => {
              return selectedShapes.includes(shape.id);
            });
            if (hasComponent) {
              alert(
                "cannot make a component with a component: not implemented as of now"
              );
              return;
            }

            const zIndexFixedShapes = ShapeFunctions.createComponent(
              selectedShapesArray,
              selectedShapes,
              shapes
            );
            if (zIndexFixedShapes) {
              shapesCopy.forEach((shape: Shape) => {
                dispatch(removeShape(shape));
              });
              dispatch(clearSelectedShapes());
              const data = {
                ...board,
                shapes: zIndexFixedShapes,
                currentUsers: [
                  ...(board.currentUsers || []).filter(
                    (curUser: any) => curUser?.user !== user.uid
                  ),
                  { user: user.uid, cursorX: x, cursorY: y },
                ],
              };
              dispatch(setWhiteboardData(data));
              handleBoardChange(data);
            }
          },
        });
      }
    } else {
      contextMenuLabels = [
        {
          label: "paste",
          onClick: () => {
            navigator.clipboard.readText().then((copiedData) => {
              const pastedShapes = JSON.parse(copiedData);
              const data = {
                ...board,
                shapes: [...shapes, ...pastedShapes],
                currentUsers: [
                  ...(board.currentUsers || []).filter(
                    (curUser: any) => curUser?.user !== user.uid
                  ),
                  { user: user.uid, cursorX: x, cursorY: y },
                ],
              };
              dispatch(setWhiteboardData(data));
              handleBoardChange(data);
            });
          },
        },
        {
          label: "undo",
          onClick: () => {
            if (history.currentIndex > 0) {
              dispatch(undo());
            }
          },
        },
        {
          label: "redo",
          onClick: () => {
            if (history.currentIndex < history.history.length - 1) {
              dispatch(redo());
            }
          },
        },
      ];
    }

    event.preventDefault();
    setContextMenuVisible(true);
    setContextMenuLabels(contextMenuLabels);
    setContextMenuX(event.clientX);
    setContextMenuY(event.clientY);
  };
  const handleContextMenuClose = () => {
    setContextMenuVisible(false);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <p>{`${window.x1} ${window.y1}`}</p>
      <p>{`${window.percentZoomed}`}</p>
      {contextMenuVisible && (
        <ContextMenu
          x={contextMenuX}
          y={contextMenuY}
          labels={contextMenuLabels}
          onClose={handleContextMenuClose}
        />
      )}
      <WhiteBoard />
    </div>
  );
};

export default MouseEventHandler;
