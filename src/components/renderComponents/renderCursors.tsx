import React, { useEffect } from "react";
import { useSelector } from "react-redux";
import img from "../../res/pointer.png";

const RenderCursors = () => {
  const user = localStorage.getItem("user");
  const board = useSelector((state: any) => state.whiteBoard);
  const userCursors = board?.currentUsers;
  const [cursors, setCursors] = React.useState<any>([]);
  const window = useSelector((state: any) => state.window);
  useEffect(() => {
    setCursors(userCursors);
  }, [userCursors]);

  return (
    <div>
      {cursors?.map((curUser: any, index: number) => {
        if (curUser.user !== user) {
          return (
            <img
              key={index}
              style={{
                position: "absolute",
                left: (curUser.cursorX - window.x1) / window.percentZoomed,
                top: (curUser.cursorY - window.y1) / window.percentZoomed,
                width: "20px",
                height: "20px",
                zIndex: 100,
              }}
              src={img}
              alt="cursor"
            />
          );
        }
        return null;
      })}
    </div>
  );
};

export default RenderCursors;
