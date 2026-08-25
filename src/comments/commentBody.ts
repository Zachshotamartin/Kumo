import type { CommentBody, CommentBodyInlineElement } from "@liveblocks/client";
import type { BoardCollaborator } from "../services/collaboratorRepository";

const emailMentionPattern = /@[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;

const inlineElements = (
  line: string,
  collaborators: readonly BoardCollaborator[]
): CommentBodyInlineElement[] => {
  const byEmail = new Map(collaborators.map((person) => [person.email.toLowerCase(), person]));
  const result: CommentBodyInlineElement[] = [];
  let cursor = 0;
  for (const match of line.matchAll(emailMentionPattern)) {
    const index = match.index!;
    if (index > cursor) result.push({ text: line.slice(cursor, index) });
    const email = match[0].slice(1).toLowerCase();
    const collaborator = byEmail.get(email);
    result.push(
      collaborator
        ? { type: "mention", kind: "user", id: collaborator.id }
        : { text: match[0] }
    );
    cursor = index + match[0].length;
  }
  if (cursor < line.length) result.push({ text: line.slice(cursor) });
  return result.length ? result : [{ text: "" }];
};

export const createCommentBody = (
  value: string,
  collaborators: readonly BoardCollaborator[] = []
): CommentBody => ({
  version: 1,
  content: value.split("\n").map((line) => ({
    type: "paragraph",
    children: inlineElements(line, collaborators),
  })),
});

export interface CommentTextPart {
  text: string;
  mentionId?: string;
}

export const commentBodyParts = (
  body: CommentBody,
  collaborators: readonly BoardCollaborator[] = []
): CommentTextPart[][] => {
  const byId = new Map(collaborators.map((person) => [person.id, person]));
  return body.content.map((paragraph) => paragraph.children.map((child) => {
    if (child.type === "mention") {
      const person = child.kind === "user" ? byId.get(child.id) : undefined;
      return {
        text: `@${person?.name || person?.email || "collaborator"}`,
        mentionId: child.id,
      };
    }
    if (child.type === "link") return { text: child.text ?? child.url };
    return { text: child.text };
  }));
};

export const commentBodyText = (
  body: CommentBody,
  collaborators: readonly BoardCollaborator[] = []
): string => commentBodyParts(body, collaborators)
  .map((paragraph) => paragraph.map((part) => part.text).join(""))
  .join("\n");

export const mentionQuery = (value: string, cursor = value.length): string | null => {
  const beforeCursor = value.slice(0, cursor);
  const match = beforeCursor.match(/(?:^|\s)@([^\s]*)$/);
  return match?.[1] !== undefined ? match[1].toLowerCase() : null;
};

export const insertMention = (
  value: string,
  person: BoardCollaborator,
  cursor = value.length
): { value: string; cursor: number } => {
  const beforeCursor = value.slice(0, cursor);
  const match = beforeCursor.match(/(?:^|\s)@([^\s]*)$/);
  const query = match?.[1];
  if (query === undefined) return { value, cursor };
  const tokenStart = cursor - query.length - 1;
  const next = `${value.slice(0, tokenStart)}@${person.email} ${value.slice(cursor)}`;
  return { value: next, cursor: tokenStart + person.email.length + 2 };
};
