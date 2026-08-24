import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "./_auth.js";
import { allowMethods, errorMessage, stringQuery } from "./_http.js";
import {
  PROFILE_COLUMNS,
  friendshipBetween,
  friendshipRowsForActor,
  getProfilesByIds,
  otherUserId,
  profileSummary,
  relationshipFor,
  type ProfileRow,
} from "./_profiles.js";
import { ensureActorProfile, supabaseAdmin } from "./_supabase.js";

const actions = new Set(["request", "accept", "decline", "cancel", "remove", "block", "unblock"]);
const expectedMutationErrors = [
  "You cannot change a friendship with yourself",
  "Profile not found",
  "Friend request unavailable",
  "This profile is not accepting friend requests",
  "This profile only accepts requests from friends of friends",
  "Incoming friend request not found",
  "Pending friend request not found",
  "Friendship not found",
  "Blocked profile not found",
];

const friendshipError = (error: unknown) => {
  const raw = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  return expectedMutationErrors.find((message) => raw.includes(message)) ?? null;
};

const searchProfiles = async (actorUid: string, rawQuery: string) => {
  const query = rawQuery.trim().replace(/[%_,()\\]/g, "").slice(0, 60);
  if (query.length < 2) return [];
  const database = supabaseAdmin();
  const [byUsername, byName, relationships] = await Promise.all([
    database.from("profiles").select(PROFILE_COLUMNS).eq("discoverable", true).ilike("username", `%${query}%`).limit(12),
    database.from("profiles").select(PROFILE_COLUMNS).eq("discoverable", true).ilike("display_name", `%${query}%`).limit(12),
    friendshipRowsForActor(actorUid),
  ]);
  if (byUsername.error) throw byUsername.error;
  if (byName.error) throw byName.error;
  const relationshipByUid = new Map(relationships.map((row) => [otherUserId(row, actorUid), row]));
  const profiles = new Map<string, ProfileRow>();
  [...(byUsername.data ?? []), ...(byName.data ?? [])].forEach((profile) => {
    profiles.set(profile.firebase_uid as string, profile as ProfileRow);
  });
  return [...profiles.values()]
    .filter((profile) => profile.firebase_uid !== actorUid)
    .map((profile) => ({
      profile,
      relationship: relationshipFor(relationshipByUid.get(profile.firebase_uid) ?? null, actorUid),
    }))
    .filter(({ relationship }) => relationship !== "hidden")
    .sort((left, right) => left.profile.display_name.localeCompare(right.profile.display_name))
    .slice(0, 12)
    .map(({ profile, relationship }) => profileSummary(profile, relationship));
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["GET", "POST"])) return;
  try {
    const actor = await requireActor(request);
    await ensureActorProfile(actor);

    if (request.method === "GET") {
      const query = stringQuery(request.query.query);
      if (query.trim()) return response.status(200).json({ results: await searchProfiles(actor.uid, query) });

      const relationships = await friendshipRowsForActor(actor.uid);
      const visible = relationships.filter((row) => row.status !== "blocked" || row.blocked_by === actor.uid);
      const profiles = await getProfilesByIds(visible.map((row) => otherUserId(row, actor.uid)));
      const groups = {
        friends: [] as ReturnType<typeof profileSummary>[],
        incoming: [] as ReturnType<typeof profileSummary>[],
        outgoing: [] as ReturnType<typeof profileSummary>[],
        blocked: [] as ReturnType<typeof profileSummary>[],
      };
      visible.forEach((row) => {
        const uid = otherUserId(row, actor.uid);
        const profile = profiles.get(uid);
        if (!profile) return;
        const relationship = relationshipFor(row, actor.uid);
        if (relationship === "friend") groups.friends.push(profileSummary(profile, relationship));
        if (relationship === "incoming") groups.incoming.push(profileSummary(profile, relationship));
        if (relationship === "outgoing") groups.outgoing.push(profileSummary(profile, relationship));
        if (relationship === "blocked") groups.blocked.push(profileSummary(profile, relationship));
      });
      Object.values(groups).forEach((group) => group.sort((left, right) => left.displayName.localeCompare(right.displayName)));
      return response.status(200).json(groups);
    }

    const action = typeof request.body?.action === "string" ? request.body.action : "";
    const targetUid = typeof request.body?.targetUid === "string" ? request.body.targetUid : "";
    if (!actions.has(action) || !targetUid) {
      return response.status(400).json({ error: "A valid friendship action and profile are required." });
    }
    const { error } = await supabaseAdmin().rpc("mutate_kumo_friendship", {
      p_actor_id: actor.uid,
      p_target_id: targetUid,
      p_action: action,
    });
    if (error) throw error;
    const relation = await friendshipBetween(actor.uid, targetUid);
    return response.status(200).json({
      targetUid,
      relationship: relationshipFor(relation, actor.uid),
    });
  } catch (error) {
    const expected = friendshipError(error);
    const message = expected ?? errorMessage(error, "We couldn't update this friendship.");
    const databaseFailure = typeof error === "object" && error !== null && "code" in error;
    return response.status(
      message === "Authentication required." ? 401 : expected ? 409 : databaseFailure ? 500 : 400
    ).json({ error: message });
  }
}
