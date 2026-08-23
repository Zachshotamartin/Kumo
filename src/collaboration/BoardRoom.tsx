import { LiveMap } from "@liveblocks/client";
import { ClientSideSuspense, RoomProvider } from "@liveblocks/react/suspense";
import { useSelector } from "react-redux";
import { RootState } from "../store";
import EditorWorkspace from "../components/editor/EditorWorkspace";
import CollaborationBridge from "./CollaborationBridge";

const RoomLoading = () => (
  <div className="app-loading" role="status">
    <span className="app-loading-mark">K</span>
    <span>Connecting to board</span>
  </div>
);

const BoardRoom = () => {
  const board = useSelector((state: RootState) => state.whiteBoard);
  if (!board.roomId) return <RoomLoading />;
  return (
    <RoomProvider
      key={board.roomId}
      id={board.roomId}
      initialPresence={{ cursor: null, selectionIds: [] }}
      initialStorage={{
        schemaVersion: 3,
        backgroundColor: board.backGroundColor,
        nodes: new LiveMap(),
      }}
    >
      <ClientSideSuspense fallback={<RoomLoading />}>
        {() => (
          <>
            <CollaborationBridge />
            <EditorWorkspace />
          </>
        )}
      </ClientSideSuspense>
    </RoomProvider>
  );
};

export default BoardRoom;
