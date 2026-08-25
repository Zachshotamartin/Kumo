import type { BoardCollaborator } from "../services/collaboratorRepository";
import {
  commentBodyParts,
  commentBodyText,
  createCommentBody,
  insertMention,
  mentionQuery,
} from "./commentBody";

const collaborators: BoardCollaborator[] = [{
  id: "user-1",
  email: "zach@example.com",
  name: "Zach Martin",
  avatar: "",
  role: "owner",
}];

describe("comment bodies", () => {
  it("converts recognized email mentions into Liveblocks mention nodes", () => {
    const body = createCommentBody("Please check @zach@example.com\nThanks", collaborators);
    expect(body.content[0]?.children).toEqual([
      { text: "Please check " },
      { type: "mention", kind: "user", id: "user-1" },
    ]);
    expect(commentBodyText(body, collaborators)).toBe("Please check @Zach Martin\nThanks");
    expect(commentBodyParts(body, collaborators)[0]?.[1]).toEqual({
      text: "@Zach Martin",
      mentionId: "user-1",
    });
  });

  it("keeps unknown mentions as text and supports empty paragraphs", () => {
    const body = createCommentBody("@unknown@example.com\n", collaborators);
    expect(body.content[0]?.children).toEqual([{ text: "@unknown@example.com" }]);
    expect(body.content[1]?.children).toEqual([{ text: "" }]);
  });

  it("finds and inserts mention suggestions at the active cursor", () => {
    expect(mentionQuery("Hello @za")).toBe("za");
    expect(mentionQuery("Hello @za world")).toBeNull();
    expect(insertMention("Hello @za later", collaborators[0]!, 9)).toEqual({
      value: "Hello @zach@example.com  later",
      cursor: 24,
    });
    expect(insertMention("No mention", collaborators[0]!)).toEqual({ value: "No mention", cursor: 10 });
  });

  it("renders non-user mentions, collaborator fallbacks, and links", () => {
    const body = { version: 1, content: [{ type: "paragraph", children: [
      { type: "mention", kind: "user", id: "email-only" },
      { type: "mention", kind: "user", id: "missing" },
      { type: "mention", kind: "group", id: "team" },
      { type: "link", url: "https://kumo.test", text: "Kumo" },
      { type: "link", url: "https://fallback.test" },
    ] }] } as Parameters<typeof commentBodyParts>[0];
    expect(commentBodyParts(body, [{ ...collaborators[0]!, id: "email-only", name: "" }])[0]).toEqual([
      { text: "@zach@example.com", mentionId: "email-only" },
      { text: "@collaborator", mentionId: "missing" },
      { text: "@collaborator", mentionId: "team" },
      { text: "Kumo" },
      { text: "https://fallback.test" },
    ]);
  });
});
