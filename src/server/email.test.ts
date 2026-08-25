import { sendInvitationEmail } from "../../server/api/_email";

const invitation = {
  to: "person@example.com",
  inviterName: `A&B <Owner> "Lead" 'One'`,
  resourceName: `Roadmap & <Launch> "Q4" 'Plan'`,
  acceptUrl: "https://kumo.test/?invite=a&next=<board>",
  kind: "board" as const,
};

describe("invitation email delivery", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns a link-only fallback outside production when delivery is unconfigured", async () => {
    vi.stubEnv("RESEND_API_KEY", "  ");
    vi.stubEnv("INVITATION_FROM_EMAIL", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    await expect(sendInvitationEmail(invitation)).resolves.toBe("link-only");
  });

  it("fails closed when production email delivery is unconfigured", async () => {
    vi.stubEnv("RESEND_API_KEY", "key");
    vi.stubEnv("INVITATION_FROM_EMAIL", "");
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(sendInvitationEmail(invitation)).rejects.toThrow("not configured for production");
  });

  it("sends escaped HTML and plain text through Resend", async () => {
    vi.stubEnv("RESEND_API_KEY", "  secret-key  ");
    vi.stubEnv("INVITATION_FROM_EMAIL", "  Kumo <invite@kumo.test>  ");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendInvitationEmail(invitation)).resolves.toBe("sent");
    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({
      method: "POST",
      headers: { Authorization: "Bearer secret-key", "Content-Type": "application/json" },
    }));
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toEqual(expect.objectContaining({
      from: "Kumo <invite@kumo.test>",
      to: ["person@example.com"],
      subject: expect.stringContaining("Roadmap & <Launch>"),
      text: expect.stringContaining("https://kumo.test/?invite=a&next=<board>"),
    }));
    expect(body.html).toContain("A&amp;B &lt;Owner&gt; &quot;Lead&quot; &#39;One&#39;");
    expect(body.html).toContain("Roadmap &amp; &lt;Launch&gt; &quot;Q4&quot; &#39;Plan&#39;");
    expect(body.html).toContain("invite=a&amp;next=&lt;board&gt;");
  });

  it("surfaces provider failures without claiming delivery", async () => {
    vi.stubEnv("RESEND_API_KEY", "key");
    vi.stubEnv("INVITATION_FROM_EMAIL", "invite@kumo.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(sendInvitationEmail(invitation)).rejects.toThrow("delivery failed (503)");
  });
});
