import { DownloadSimple, ShieldCheck, Trash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import ui from "../ui/Ui.module.css";
import { cancelAccountDeletion, exportAccountData, loadNotificationPreferences, loadOperations, loadPushConfig, requestAccountDeletion, revokeAccountSessions, subscribePush, testPush, updateNotificationPreferences, type NotificationPreferences, type OperationsOverview } from "../../services/platformRepository";
import { downloadBlob } from "../../editor/export";
import styles from "./PlatformViews.module.css";
import { disableBackgroundPush, enableBackgroundPush } from "../../platform/browserNotifications";
import { ActivityLog } from "./ActivityLog";

export const SettingsView = () => {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [operations, setOperations] = useState<OperationsOverview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeletion, setConfirmDeletion] = useState(false);
  useEffect(() => { void Promise.all([loadNotificationPreferences(), loadOperations()]).then(([nextPreferences, nextOperations]) => { setPreferences(nextPreferences); setOperations(nextOperations); }).catch((caught) => setError(caught instanceof Error ? caught.message : "Settings could not be loaded.")); }, []);
  const update = async (patch: Partial<NotificationPreferences>) => {
    const previous = preferences!;
    if (patch.browser_enabled === true) {
      const config = await loadPushConfig();
      if (!config.configured) { setError("Background push is not configured for this deployment."); return; }
      const subscription = await enableBackgroundPush(config.publicKey, subscribePush);
      if (!subscription) { setError("Allow notifications in your browser before enabling Kumo browser alerts."); return; }
    }
    const next = { ...previous, ...patch };
    setPreferences(next);
    try {
      setPreferences(await updateNotificationPreferences(next));
      if (patch.browser_enabled === false) await disableBackgroundPush().catch(() => false);
      setError(null);
    }
    catch (caught) { setPreferences(previous); setError(caught instanceof Error ? caught.message : "Notification settings could not be saved."); }
  };
  return <section className={styles.view} aria-label="Account and notification settings"><div className={styles.heading}><div><h1>Settings</h1><p>Control delivery, security, recovery, and account data from one place.</p></div></div>
    <section className={styles.section}><h2>Notifications</h2>{preferences && <div className={styles.preferences}><label className={styles.preference}><span>Email notifications</span><input type="checkbox" checked={preferences.email_enabled} onChange={(event) => void update({ email_enabled: event.target.checked })} /></label><label className={styles.preference}><span>Browser notifications</span><input type="checkbox" checked={preferences.browser_enabled} onChange={(event) => void update({ browser_enabled: event.target.checked })} /></label><label className={styles.preference}><span>Delivery</span><select value={preferences.digest} onChange={(event) => void update({ digest: event.target.value as NotificationPreferences["digest"] })}><option value="instant">Instant</option><option value="daily">Daily digest</option><option value="weekly">Weekly digest</option><option value="off">Off</option></select></label><label className={styles.preference}><span>Board comments</span><select value={preferences.board_comments} onChange={(event) => void update({ board_comments: event.target.value as NotificationPreferences["board_comments"] })}><option value="all">Everything</option><option value="mentions">Mentions and replies</option><option value="off">Off</option></select></label><label className={styles.preference}><span>Branch reviews</span><input type="checkbox" checked={preferences.branch_reviews} onChange={(event) => void update({ branch_reviews: event.target.checked })} /></label><label className={styles.preference}><span>Library updates</span><input type="checkbox" checked={preferences.library_updates} onChange={(event) => void update({ library_updates: event.target.checked })} /></label>{preferences.browser_enabled && <button type="button" className={`${ui.button} ${ui.buttonGhost}`} onClick={() => void testPush().then((result) => setMessage(result.delivered ? "Background push delivered." : "No active push subscription was found.")).catch((caught) => setError(caught instanceof Error ? caught.message : "Push test failed."))}>Send test notification</button>}</div>}</section>
    <section className={styles.section}><h2>Collaboration health</h2>{operations && <><div className={styles.metrics}><span className={styles.metric}><b>{operations.telemetry.counts.ready}</b><span>Ready</span></span><span className={styles.metric}><b>{operations.telemetry.counts.lost}</b><span>Disconnects</span></span><span className={styles.metric}><b>{Math.round(operations.telemetry.recoveryRate * 100)}%</b><span>Recovered</span></span><span className={styles.metric}><b>{operations.telemetry.averageRecoveryMs}ms</b><span>Mean recovery</span></span></div><small>{operations.telemetry.healthy ? "Connection telemetry is healthy." : "Connection failures need review."}</small></>}</section>
    {operations && <section className={styles.section}><h2>Activity log</h2><ActivityLog operations={operations} /></section>}
    <section className={styles.section}><h2>Security and account data</h2><div className={styles.actions}><button type="button" className={`${ui.button} ${ui.buttonGhost}`} onClick={() => void exportAccountData().then((data) => { downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "kumo-account-export.json"); setMessage("Account export downloaded."); })}><DownloadSimple aria-hidden="true" /> Export data</button><button type="button" className={`${ui.button} ${ui.buttonGhost}`} onClick={() => void revokeAccountSessions().then(() => setMessage("Other sessions revoked."))}><ShieldCheck aria-hidden="true" /> Revoke sessions</button><button type="button" className={`${ui.button} ${ui.buttonDanger}`} onClick={() => setConfirmDeletion(true)}><Trash aria-hidden="true" /> Schedule deletion</button><button type="button" className={`${ui.button} ${ui.buttonGhost}`} onClick={() => void cancelAccountDeletion().then(() => setMessage("Scheduled deletion cancelled."))}>Cancel deletion</button></div></section>
    {confirmDeletion && <div className={styles.dialogBackdrop} role="presentation"><section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="schedule-deletion-title"><h2 id="schedule-deletion-title">Schedule account deletion?</h2><p>Your account will enter a recovery period before permanent deletion. You can cancel the request from this page during that period.</p><div className={styles.dialogActions}><button type="button" className={`${ui.button} ${ui.buttonGhost}`} onClick={() => setConfirmDeletion(false)}>Keep account</button><button type="button" className={`${ui.button} ${ui.buttonDanger}`} onClick={() => void requestAccountDeletion().then(({ deletion }) => { setConfirmDeletion(false); setMessage(`Account deletion scheduled for ${new Date(deletion.scheduled_for).toLocaleDateString()}.`); }).catch((caught) => setError(caught instanceof Error ? caught.message : "Account deletion could not be scheduled."))}>Confirm deletion</button></div></section></div>}
    {message && <p className={styles.message} role="status">{message}</p>}{error && <p className={styles.error} role="alert">{error}</p>}
  </section>;
};
