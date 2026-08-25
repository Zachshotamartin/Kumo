interface InvitationEmail {
  to: string;
  inviterName: string;
  resourceName: string;
  acceptUrl: string;
  kind: "board" | "workspace";
}

export const sendInvitationEmail = async (invitation: InvitationEmail): Promise<"sent" | "link-only"> => {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.INVITATION_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    if (process.env.VERCEL_ENV === "production") throw new Error("Invitation email delivery is not configured for production.");
    return "link-only";
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [invitation.to],
      subject: `${invitation.inviterName} invited you to ${invitation.resourceName} on Kumo`,
      text: `${invitation.inviterName} invited you to the Kumo ${invitation.kind} “${invitation.resourceName}”. Accept the invitation: ${invitation.acceptUrl}`,
      html: `<p><strong>${escapeHtml(invitation.inviterName)}</strong> invited you to the Kumo ${invitation.kind} <strong>${escapeHtml(invitation.resourceName)}</strong>.</p><p><a href="${escapeHtml(invitation.acceptUrl)}">Accept invitation</a></p>`,
    }),
  });
  if (!response.ok) throw new Error(`Invitation email delivery failed (${response.status}).`);
  return "sent";
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]!));
