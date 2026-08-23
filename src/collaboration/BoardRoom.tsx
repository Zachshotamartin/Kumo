import { LiveMap } from "@liveblocks/client";
import { ClientSideSuspense, RoomProvider } from "@liveblocks/react/suspense";
import { useSelector } from "react-redux";
import { RootState } from "../store";
import EditorWorkspace from "../components/editor/EditorWorkspace";
import CollaborationBridge from "./CollaborationBridge";
import KumoLogo from "../components/brand/KumoLogo";

const RoomLoading = () => (
  <div className="app-loading" role="status">
    <div className="app-loading-brand">
      <KumoLogo className="app-loading-logo" context="loading" decorative />
      <span className="app-loading-word">Kumo</span>
    </div>
    <span className="app-loading-status">Connecting to board</span>
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
