import { GitFork, Warning } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import ui from "../ui/Ui.module.css";
import {
  loadCommunity,
  loadCommunityModeration,
  moderateCommunity,
  remixCommunity,
  reportCommunityCategory,
  type CommunityPublication,
  type CommunityReport,
} from "../../services/platformRepository";
import styles from "./PlatformViews.module.css";

const reportCategories = [
  ["spam", "Spam or promotion"],
  ["harassment", "Harassment or hate"],
  ["copyright", "Copyright concern"],
  ["unsafe", "Unsafe content"],
  ["misleading", "Misleading content"],
  ["other", "Other"],
] as const;

const caughtMessage = (caught: unknown, fallback: string) => caught instanceof Error ? caught.message : fallback;

export const CommunityView = ({ onOpenBoard, selectedSlug = null }: { onOpenBoard: (boardId: string) => void; selectedSlug?: string | null }) => {
  const [publications, setPublications] = useState<CommunityPublication[]>([]);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [reportTarget, setReportTarget] = useState<CommunityPublication | null>(null);
  const [reportCategory, setReportCategory] = useState("spam");
  const [reportDetails, setReportDetails] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadCommunity().then(setPublications).catch((caught) => setError(caughtMessage(caught, "Community boards could not be loaded.")));
    void loadCommunityModeration().then(setReports).catch(() => setReports([]));
  }, []);

  const submitReport = async () => {
    setError(null);
    try {
      await reportCommunityCategory(reportTarget!.board_id, reportCategory, reportDetails || "Please review this community publication.");
      setReportTarget(null);
      setReportDetails("");
      setMessage("Report sent for moderation.");
    } catch (caught) {
      setError(caughtMessage(caught, "The report could not be sent."));
    }
  };

  const decide = async (report: CommunityReport, decision: "reviewed" | "dismissed" | "removed") => {
    setError(null);
    try {
      await moderateCommunity(report.id, decision);
      setReports((current) => current.filter((item) => item.id !== report.id));
      if (decision === "removed") setPublications((current) => current.filter((item) => item.board_id !== report.board_id));
      setMessage(`Report ${decision}.`);
    } catch (caught) {
      setError(caughtMessage(caught, "The moderation decision could not be saved."));
    }
  };

  const remix = async (boardId: string) => {
    setError(null);
    try {
      const result = await remixCommunity(boardId);
      onOpenBoard(result.boardId);
    } catch (caught) {
      setError(caughtMessage(caught, "This board could not be remixed."));
    }
  };

  return <section className={styles.view} aria-label="Kumo community">
    <div className={styles.heading}><div><h1>Community</h1><p>Explore linked visual systems, remix what creators allow, and preserve attribution.</p></div></div>
    <div className={styles.communityGrid}>{publications.map((item) => <article className={styles.communityCard} key={item.board_id} data-selected={item.slug === selectedSlug || undefined}>
      <div><h3>{item.boards?.title ?? item.slug}</h3><p>{item.description || "A public Kumo board."}</p><div className={styles.tags}>{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div>
      <div className={styles.actions}><button type="button" aria-current={item.slug === selectedSlug ? "true" : undefined} className={`${ui.button} ${ui.buttonPrimary}`} onClick={() => onOpenBoard(item.board_id)}>Open</button>{item.remix_allowed && <button type="button" className={`${ui.button} ${ui.buttonGhost}`} onClick={() => void remix(item.board_id)}><GitFork aria-hidden="true" /> Remix ({item.remix_count})</button>}<button type="button" className={`${ui.button} ${ui.buttonGhost} ${ui.iconButton}`} aria-label={`Report ${item.boards?.title ?? item.slug}`} onClick={() => setReportTarget(item)}><Warning aria-hidden="true" /></button></div>
    </article>)}</div>
    {!publications.length && <p>No community boards have been published yet.</p>}
    {reports.length > 0 && <section className={styles.section} aria-label="Community moderation queue"><h2>Moderation queue</h2>{reports.map((report) => <article className={styles.communityCard} key={report.id}><div><h3>{report.boards?.title ?? report.board_id}</h3><p><strong>{report.category}</strong> · {report.reason}</p></div><div className={styles.actions}><button type="button" className={`${ui.button} ${ui.buttonGhost}`} onClick={() => void decide(report, "reviewed")}>Mark reviewed</button><button type="button" className={`${ui.button} ${ui.buttonGhost}`} onClick={() => void decide(report, "dismissed")}>Dismiss</button><button type="button" className={`${ui.button} ${ui.buttonDanger}`} onClick={() => void decide(report, "removed")}>Remove publication</button></div></article>)}</section>}
    {reportTarget && <div className={styles.dialogBackdrop} role="presentation"><section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="community-report-title"><h2 id="community-report-title">Report {reportTarget.boards?.title ?? reportTarget.slug}</h2><label><span>Reason</span><select aria-label="Report reason" value={reportCategory} onChange={(event) => setReportCategory(event.target.value)}>{reportCategories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Details</span><textarea aria-label="Report details" value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={500} /></label><div className={styles.actions}><button type="button" className={`${ui.button} ${ui.buttonGhost}`} onClick={() => setReportTarget(null)}>Cancel</button><button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={() => void submitReport()}>Send report</button></div></section></div>}
    {message && <p className={styles.message} role="status">{message}</p>}
    {error && <p className={ui.noticeError} role="alert">{error}</p>}
  </section>;
};
