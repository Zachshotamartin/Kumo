import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  MagnifyingGlass,
  Prohibit,
  UserMinus,
  UserPlus,
  X,
} from "@phosphor-icons/react";
import {
  listFriendships,
  mutateFriendship,
  searchProfiles,
  type FriendsOverview,
  type FriendshipAction,
  type SocialProfile,
} from "../../services/socialRepository";
import { ProfileAvatar } from "./ProfileAvatar";
import styles from "./Social.module.css";

const emptyOverview: FriendsOverview = { friends: [], incoming: [], outgoing: [], blocked: [] };

const Person = ({
  person,
  busy,
  onOpen,
  onAction,
}: {
  person: SocialProfile;
  busy: boolean;
  onOpen: () => void;
  onAction: (action: FriendshipAction) => void;
}) => {
  const actions = person.relationship === "incoming"
    ? [
        ["accept", "Accept", Check, "primary"],
        ["decline", "Decline", X, "default"],
        ["block", "Block", Prohibit, "danger"],
      ] as const
    : person.relationship === "outgoing"
      ? [["cancel", "Cancel request", X, "default"]] as const
      : person.relationship === "friend"
        ? [
            ["remove", "Remove friend", UserMinus, "default"],
            ["block", "Block", Prohibit, "danger"],
          ] as const
        : person.relationship === "blocked"
          ? [["unblock", "Unblock", Check, "default"]] as const
          : [["request", "Add friend", UserPlus, "primary"]] as const;

  return (
    <article className={styles.person}>
      <ProfileAvatar name={person.displayName} avatarUrl={person.avatarUrl} />
      <button type="button" className={styles.personIdentity} onClick={onOpen}>
        <strong>{person.displayName}</strong>
        <span>@{person.username}</span>
        {person.bio && <small>{person.bio}</small>}
      </button>
      <div className={styles.actions}>
        <button type="button" className={styles.iconButton} onClick={onOpen} aria-label={`Open ${person.displayName}'s profile`} title="Open profile">
          <ArrowUpRight aria-hidden="true" />
        </button>
        {actions.map(([action, label, Icon, tone]) => (
          <button
            type="button"
            key={action}
            className={tone === "primary" ? styles.buttonPrimary : tone === "danger" ? styles.buttonDanger : styles.button}
            disabled={busy}
            onClick={() => onAction(action)}
          >
            <Icon aria-hidden="true" />{busy ? "Working" : label}
          </button>
        ))}
      </div>
    </article>
  );
};

const PeopleSection = ({
  title,
  people,
  emptyTitle,
  emptyCopy,
  busyUid,
  onOpenProfile,
  onAction,
}: {
  title: string;
  people: SocialProfile[];
  emptyTitle?: string;
  emptyCopy?: string;
  busyUid: string | null;
  onOpenProfile: (username: string) => void;
  onAction: (person: SocialProfile, action: FriendshipAction) => void;
}) => (
  <section className={styles.section} aria-labelledby={`friends-${title.toLowerCase().replace(/\s+/g, "-")}`}>
    <div className={styles.sectionHeading}>
      <h2 id={`friends-${title.toLowerCase().replace(/\s+/g, "-")}`}>{title}</h2>
      <span>{people.length}</span>
    </div>
    {people.length ? (
      <div className={styles.peopleGrid}>
        {people.map((person) => (
          <Person
            key={person.id}
            person={person}
            busy={busyUid === person.id}
            onOpen={() => onOpenProfile(person.username)}
            onAction={(action) => onAction(person, action)}
          />
        ))}
      </div>
    ) : emptyTitle ? (
      <div className={styles.empty}><strong>{emptyTitle}</strong><span>{emptyCopy}</span></div>
    ) : null}
  </section>
);

export const FriendsView = ({
  onOpenProfile,
  onIncomingCountChange,
}: {
  onOpenProfile: (username: string) => void;
  onIncomingCountChange: (count: number) => void;
}) => {
  const [overview, setOverview] = useState<FriendsOverview>(emptyOverview);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SocialProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const next = await listFriendships();
    setOverview(next);
    onIncomingCountChange(next.incoming.length);
  };

  useEffect(() => {
    let active = true;
    void listFriendships()
      .then((next) => {
        if (!active) return;
        setOverview(next);
        onIncomingCountChange(next.incoming.length);
        setLoading(false);
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "We couldn't load your friends.");
        setLoading(false);
      });
    return () => { active = false; };
  }, [onIncomingCountChange]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) return;
    let active = true;
    const timeout = window.setTimeout(() => {
      setSearching(true);
      void searchProfiles(normalized)
        .then((next) => active && setResults(next))
        .catch((caught) => {
          if (!active) return;
          setResults([]);
          setError(caught instanceof Error ? caught.message : "We couldn't search profiles.");
        })
        .finally(() => active && setSearching(false));
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [query]);

  const visibleResults = useMemo(() => query.trim().length >= 2 ? results : [], [query, results]);

  const changeQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    setSearching(nextQuery.trim().length >= 2);
    if (nextQuery.trim().length < 2) setResults([]);
  };

  const act = async (person: SocialProfile, action: FriendshipAction) => {
    if (busyUid) return;
    if ((action === "block" || action === "remove") && !window.confirm(
      action === "block"
        ? `Block ${person.displayName}? They will not be able to find or request you.`
        : `Remove ${person.displayName} from your friends? Existing board access will stay unchanged.`
    )) return;
    setBusyUid(person.id);
    setError(null);
    try {
      const relationship = await mutateFriendship(person.id, action);
      setResults((current) => current.map((candidate) => candidate.id === person.id
        ? { ...candidate, relationship }
        : candidate));
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't update this friendship.");
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1>People in your orbit.</h1>
          <p>Find collaborators once, then share the next board without asking for their email again.</p>
        </div>
        <label className={styles.search}>
          <span className="sr-only">Search profiles</span>
          <MagnifyingGlass aria-hidden="true" />
          <input value={query} onChange={(event) => changeQuery(event.target.value)} placeholder="Search names or usernames" />
        </label>
      </header>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {loading ? <div className={styles.skeleton} aria-label="Loading friends" /> : query.trim().length >= 2 ? (
        searching ? <div className={styles.skeleton} aria-label="Searching profiles" /> : (
          <PeopleSection
            title="Search results"
            people={visibleResults}
            emptyTitle="No profiles found"
            emptyCopy="Try a different name or exact username."
            busyUid={busyUid}
            onOpenProfile={onOpenProfile}
            onAction={act}
          />
        )
      ) : (
        <>
          {overview.incoming.length > 0 && <PeopleSection title="Requests" people={overview.incoming} busyUid={busyUid} onOpenProfile={onOpenProfile} onAction={act} />}
          <PeopleSection
            title="Friends"
            people={overview.friends}
            emptyTitle="No friends yet"
            emptyCopy="Search for someone you already build with."
            busyUid={busyUid}
            onOpenProfile={onOpenProfile}
            onAction={act}
          />
          {overview.outgoing.length > 0 && <PeopleSection title="Sent requests" people={overview.outgoing} busyUid={busyUid} onOpenProfile={onOpenProfile} onAction={act} />}
          {overview.blocked.length > 0 && <PeopleSection title="Blocked profiles" people={overview.blocked} busyUid={busyUid} onOpenProfile={onOpenProfile} onAction={act} />}
        </>
      )}
    </div>
  );
};
