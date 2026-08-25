import { GitFork, Warning } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import ui from "../ui/Ui.module.css";
import { loadCommunity, remixCommunity, reportCommunity, type CommunityPublication } from "../../services/platformRepository";
import styles from "./PlatformViews.module.css";

export const CommunityView = ({ onOpenBoard }: { onOpenBoard: (boardId: string) => void }) => {
  const [publications, setPublications] = useState<CommunityPublication[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { void loadCommunity().then(setPublications); }, []);
  return <section className={styles.view} aria-label="Kumo community"><div className={styles.heading}><div><h1>Community</h1><p>Explore linked visual systems, remix what creators allow, and preserve attribution.</p></div></div><div className={styles.communityGrid}>{publications.map((item) => <article className={styles.communityCard} key={item.board_id}><div><h3>{item.boards?.title ?? item.slug}</h3><p>{item.description || "A public Kumo board."}</p><div className={styles.tags}>{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div><div className={styles.actions}><button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={() => onOpenBoard(item.board_id)}>Open</button>{item.remix_allowed && <button type="button" className={`${ui.button} ${ui.buttonGhost}`} onClick={() => void remixCommunity(item.board_id).then(({ boardId }) => onOpenBoard(boardId))}><GitFork aria-hidden="true" /> Remix ({item.remix_count})</button>}<button type="button" className={`${ui.button} ${ui.buttonGhost} ${ui.iconButton}`} aria-label={`Report ${item.boards?.title ?? item.slug}`} onClick={() => void reportCommunity(item.board_id, "Reported from the community browser for moderation review.").then(() => setMessage("Report sent for moderation."))}><Warning aria-hidden="true" /></button></div></article>)}</div>{!publications.length && <p>No community boards have been published yet.</p>}{message && <p className={styles.message} role="status">{message}</p>}</section>;
};
