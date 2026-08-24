# Friends and profiles

## Product goal

Kumo profiles give collaborators a stable identity outside a single board. Friendships make repeated collaboration faster without replacing access control: a friend still has no board access until an owner explicitly shares that board.

## Profile model

Every authenticated user has one profile with:

- an immutable Firebase UID and normalized account email
- an editable display name, unique lowercase username, biography, and HTTPS avatar URL
- a discoverability switch
- a friend-request policy: everyone, friends of friends, or nobody
- derived counts for accepted friends and public boards

Usernames are 3-30 characters and may contain lowercase letters, digits, periods, underscores, and hyphens. Existing accounts receive a deterministic collision-resistant username during migration. Session provisioning creates missing profiles and refreshes email, but it never overwrites a user-edited name, username, biography, avatar, or privacy setting.

Profiles are visible only to authenticated Kumo users. Search returns discoverable profiles and never returns email addresses. Direct email sharing remains available through the board sharing dialog and continues to reveal an email only after that person is a board collaborator.

## Friendship state machine

One canonical database row exists per unordered pair of users.

| Current state | Actor action | Result |
| --- | --- | --- |
| none | request | outgoing pending request |
| pending from the other user | request or accept | accepted friendship |
| pending from the actor | cancel | no relationship |
| pending from the other user | decline | no relationship |
| accepted | remove | no relationship |
| any non-blocked state | block | blocked by the actor |
| blocked by the actor | unblock | no relationship |

Requests are idempotent. Crossing requests become accepted instead of creating duplicates. A user cannot request themselves. A block removes any pending or accepted relationship, prevents future requests and new board invitations in either direction, hides the blocker from the blocked user, and can only be removed by the user who created it. Existing explicit board access remains until a board owner removes it.

The friends-of-friends policy permits a request only when the pair has at least one accepted mutual friend. The nobody policy rejects all new requests. Existing accepted friends are unaffected by policy changes.

## Product surfaces

### Dashboard navigation

- Boards remains the default authenticated view.
- Friends opens the relationship workspace and exposes an incoming-request count.
- Profile opens the current user profile editor.
- A profile username in search results or a friend row opens that signed-in-only profile.

### Friends workspace

- Search by username or display name with a debounced request and complete loading, empty, and error states.
- Incoming requests support accept, decline, and block.
- Accepted friends support opening the profile and removing or blocking the relationship.
- Sent requests support cancellation.
- Profiles blocked by the current user support unblocking and are visually separated from normal relationships.

### Profile workspace

- The owner can edit display name, username, biography, avatar URL, discoverability, and request policy.
- Other users see the relationship-appropriate action: add friend, accept, cancel request, remove friend, block, or unblock.
- Public boards owned by the profile are visible and open as access-controlled viewer sessions.
- The profile link uses `?profile=<username>` and can be copied.

### Board sharing

- Email sharing remains unchanged.
- The owner also sees accepted friends in the share dialog.
- A friend can be granted viewer or editor access with the same connected-board scope used by email sharing.
- The API verifies the accepted friendship before using a friend UID. The browser cannot use this path to share with an arbitrary UID.
- Friendship removal never revokes existing board access. Board membership and friendship are separate explicit permissions.

## Authorization and privacy

- Firebase ID tokens identify every API actor.
- Supabase service-role access remains server-only.
- Friendship mutations run through a service-role-only Postgres function that locks the canonical pair row.
- Profile updates can target only the authenticated actor.
- Search excludes the actor, non-discoverable profiles, and users who blocked the actor.
- Blocked relationships are not disclosed to the blocked user.
- Share-by-friend verifies both board ownership and an accepted friendship before the existing transactional board membership function runs.
- Relationship and profile changes write audit events without exposing private profile data in the payload.

## API contract

- `GET /api/profile`: current profile, relationship counts, and public boards
- `GET /api/profile?username=<username>`: signed-in profile view, relationship state, and public boards
- `PATCH /api/profile`: update validated current-profile fields
- `GET /api/friends`: accepted, incoming, outgoing, and actor-created blocked relationships
- `GET /api/friends?query=<query>`: discoverable profile search with relationship state
- `POST /api/friends`: `{ action, targetUid }` where action is request, accept, decline, cancel, remove, block, or unblock
- `POST /api/share-board`: invite accepts either the existing email or a `friendUid`; friend UIDs require an accepted friendship

## Limits and non-goals

- Friendships are bilateral connections, not followers.
- There is no activity feed, direct messaging, contact import, recommendation ranking, or public unauthenticated profile page.
- Profile avatars are HTTPS URLs in this release. A dedicated profile-media pipeline can be added later without coupling avatars to board assets.
- Friends lists and profile search are bounded server-side. Large-network pagination is a future extension.

## Verification matrix

- migration shape, constraints, grants, profile preservation, and friendship transition tests
- API authorization, validation, privacy, block, policy, crossing-request, and friend-share tests
- repository request/response contract tests
- profile and friends component loading, empty, error, keyboard, and mutation tests
- share-dialog email and friend paths, including non-friend rejection
- authenticated local smoke with two temporary users, request, accept, friend share, removal, and cleanup
- Playwright coverage for profile editing, discovery, relationship actions, and friend selection in board sharing
