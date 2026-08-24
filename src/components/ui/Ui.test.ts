import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import dashboardSource from "../dashboard/BoardDashboard.tsx?raw";
import homeSource from "../homepage/homePage.tsx?raw";
import friendsSource from "../social/FriendsView.tsx?raw";
import profileSource from "../social/ProfileView.tsx?raw";
import commentsSource from "../../comments/CommentsPanel.tsx?raw";
import historySource from "../../history/VersionHistoryPanel.tsx?raw";
import workspaceSource from "../editor/EditorWorkspace.tsx?raw";

const readCss = (relativePath: string) => readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
const rootCss = readCss("../../index.css");
const appCss = readCss("../../App.css");
const uiCss = readCss("./Ui.module.css");
const editorCss = readCss("../editor/EditorWorkspace.module.css");
const canvasCss = readCss("../editor/EditorCanvas.module.css");
const commentsCss = readCss("../../comments/Comments.module.css");
const historyCss = readCss("../../history/VersionHistory.module.css");

describe("Kumo design system", () => {
  it("defines one semantic type, surface, control, motion, and elevation scale", () => {
    for (const token of [
      "--kumo-text-2xs",
      "--kumo-text-2xl",
      "--kumo-surface-raised",
      "--kumo-control-compact",
      "--kumo-control-comfortable",
      "--kumo-motion-standard",
      "--kumo-z-dialog",
      "--kumo-focus-ring",
    ]) expect(rootCss).toContain(token);
    for (const primitive of [
      ".button",
      ".buttonPrimary",
      ".buttonDanger",
      ".control",
      ".field",
      ".sectionHeading",
      ".emptyState",
      ".notice",
      ".panelHeader",
    ]) expect(uiCss).toContain(primitive);
  });

  it("uses the shared primitives across every application surface", () => {
    for (const source of [homeSource, dashboardSource, friendsSource, profileSource, commentsSource, historySource, workspaceSource]) {
      expect(source).toContain("Ui.module.css");
    }
  });

  it("does not reintroduce unreadable 8–10px product typography", () => {
    const productCss = [appCss, uiCss, editorCss, canvasCss, commentsCss, historyCss].join("\n");
    expect(productCss).not.toMatch(/font-size:\s*(?:8|9|10)px/);
    expect(productCss).not.toMatch(/font:\s*[^;]*(?:8|9|10)px/);
  });

  it("keeps Share on the common topbar geometry with only a tone modifier", () => {
    expect(workspaceSource).toContain("`${styles.secondaryTopbarButton} ${styles.primaryTopbarButton}`");
    expect(workspaceSource).not.toContain("className={styles.shareButton}");
  });
});
