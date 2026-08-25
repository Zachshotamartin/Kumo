import { DownloadSimple, FunnelSimple } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { downloadBlob } from "../../editor/export";
import type { OperationsOverview } from "../../services/platformRepository";
import ui from "../ui/Ui.module.css";
import styles from "./PlatformViews.module.css";
import { csvCell } from "./activityCsv";

export const ActivityLog = ({ operations }: { operations: OperationsOverview }) => {
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState("all");
  const [since, setSince] = useState("30");
  const [renderedAt] = useState(() => Date.now());
  const eventTypes = useMemo(() => [...new Set(operations.events.map((event) => event.event_type))].sort(), [operations.events]);
  const visible = useMemo(() => {
    const cutoff = since === "all" ? 0 : renderedAt - Number(since) * 86_400_000;
    const normalized = query.trim().toLowerCase();
    return operations.events.filter((event) => (eventType === "all" || event.event_type === eventType)
      && new Date(event.created_at).getTime() >= cutoff
      && (!normalized || `${event.event_type} ${event.actor_id ?? ""} ${event.board_id ?? ""} ${JSON.stringify(event.payload)}`.toLowerCase().includes(normalized)));
  }, [eventType, operations.events, query, renderedAt, since]);
  const exportCsv = () => {
    const rows = ["timestamp,event,actor,board,payload", ...visible.map((event) => [event.created_at, event.event_type, event.actor_id, event.board_id, JSON.stringify(event.payload)].map(csvCell).join(","))];
    downloadBlob(new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }), `kumo-activity-${new Date().toISOString().slice(0, 10)}.csv`);
  };
  return <div className={styles.activityLog}>
    <div className={styles.activityFilters}><label><FunnelSimple aria-hidden="true" /><span className="sr-only">Search activity</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activity" /></label><select aria-label="Activity type" value={eventType} onChange={(event) => setEventType(event.target.value)}><option value="all">All events</option>{eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select><select aria-label="Activity date range" value={since} onChange={(event) => setSince(event.target.value)}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="all">All retained</option></select><button type="button" className={`${ui.button} ${ui.buttonGhost}`} onClick={exportCsv}><DownloadSimple aria-hidden="true" /> Export CSV</button></div>
    <div className={styles.activityRows} role="list" aria-label={`${visible.length} activity events`}>{visible.map((event) => <article key={event.id} role="listitem"><span><strong>{event.event_type.replace(/[._]/g, " ")}</strong><small>{event.board_id ? `Board ${event.board_id.slice(0, 8)}` : "Account"}</small></span><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time><code>{Object.keys(event.payload ?? {}).length ? JSON.stringify(event.payload) : "No details"}</code></article>)}</div>
    {!visible.length && <p className={ui.emptyState}>No activity matches these filters.</p>}
  </div>;
};
