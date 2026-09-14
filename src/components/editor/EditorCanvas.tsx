import { useUpdateMyPresence } from '@liveblocks/react';
import { useEditorActions } from '../../editor/useEditorActions';
import { useCollaborativeText } from '../../collaboration/useCollaborativeText';
import { CommentPins } from '../../comments/CommentPins';
import { EditorCanvasView } from './EditorCanvasView';
import { uploadBoardAsset, deleteBoardAsset } from '../../services/assetRepository';

export { EditorCanvasView } from './EditorCanvasView';

export default function EditorCanvas() {
  const actions = useEditorActions();
  const updateMyPresence = useUpdateMyPresence();
  const applyCollaborativeText = useCollaborativeText();
  return <EditorCanvasView actions={actions} updateMyPresence={updateMyPresence} applyCollaborativeText={applyCollaborativeText} commentPins={<CommentPins />} mediaRepository={{ upload: uploadBoardAsset, remove: deleteBoardAsset }} />;
}
