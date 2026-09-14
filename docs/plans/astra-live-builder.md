# Astra live builder and sidebar clearance

Status: implemented on this branch; release validation is in progress. The generated registry covers 180 native editor/repository actions, plus 14 canvas, navigation, and observed-control capabilities. See [the operations guide](../astra-builder.md) for the delivered architecture and launch configuration. Real paid inference remains a launch gate because no server OpenAI credential or spending authorization was supplied.
Branch: `feature/astra-live-builder`.
Delivery: one PR containing the sidebar fix, the builder, its backend and migrations, tests, and documentation. Do not open or merge a separate sidebar-only PR.

## Outcome and scope

A signed-in user can ask Astra to perform the Kumo actions their role permits. Owners/editors can build editable compositions, watch real changes with a labeled cursor, change reasoning effort, stop work, and undo supported changes. Examples: “Create a three-column product roadmap,” “Build a settings-screen mockup,” and “Align these cards and connect the steps.”

Release requirement: full Kumo capability parity. The agent can perform every user-facing action available to the current user, including advanced editing, assets, prototypes, exports, history, branches, sharing, workspace organization, and account controls. A shape-only builder is an internal milestone, not the deliverable. Existing content is changed within the user's task scope; output remains ordinary editable Kumo content.

Parity means everything the user can do inside Kumo, with the same role permissions, validation, file permissions, and existing confirmations. The agent can navigate accessible boards when the task calls for it. It does not add unrelated OS control, arbitrary code execution, or a new website-hosting platform. No Claude integration is included.

## 1. Sidebar clearance

The screenshot shows the fixed bottom-right Liveblocks badge covering the final Layer action. The installed SDK renders a 111 × 38 CSS-pixel badge, inset 12px from the bottom and right. The screenshot is consistent with a higher pixel-density capture. The inspector currently ends at the viewport edge with no space below its last controls.

Add `80px + env(safe-area-inset-bottom)` of bottom padding and matching scroll padding to the shared `.inspectorBody`. This provides actual scrollable space and a focus-scroll inset. It applies to Properties, Assets, Prototype, Export, Inspect, Studio, Product tools, and Branches. The builder must use the same clearance variable, including its sticky composer. Keep the header and outer panel height unchanged.

Keep the badge visible in its current location. Liveblocks supports corner relocation through `badgeLocation`, but moving it to another corner would require reserving space around different controls. Extra inspector space is the smallest fix for the reported problem. [Liveblocks branding documentation](https://liveblocks.io/docs/api-reference/liveblocks-client#powered-by-liveblocks-branding)

Validation: final controls remain above the badge and receive pointer events at 220/280/480px sidebar widths and 600/768px viewport heights. Check keyboard focus, browser zoom, mobile safe areas, and collapsed/reopened panels. The backend-free regression uses the installed badge's geometry; a real connected preview must additionally confirm actual attribution placement.

## 2. Model and editable effort

Use the OpenAI Responses API with model `gpt-6-astra`. The documented API effort values are `low`, `medium`, `high`, `xhigh`, and `max`; do not copy the desktop app's additional effort labels into the API contract. Astra supports streaming, function calling, and structured outputs. API account access still needs verification with the project's credentials. [Astra model documentation](https://developers.openai.com/api/docs/models/gpt-6-astra)

Display Model: Astra and an Effort selector with Low, Medium, High, XHigh, Max. Proposed default: Low. Remember the user's choice locally and persist the effective choice on each run. The server allowlists the model and effort values. There is no silent model substitution or automatic effort escalation.

Effort is editable before a run and while it is running. During a run, a change applies to the next model request; display “Applies to the next step” until then. An already-issued request keeps its original setting. This gives predictable behavior without requiring mid-response WebSocket reconfiguration in V1. Record effort per model step so cost and debugging reflect what actually ran.

Use bounded `max_output_tokens`; reasoning tokens share the output allowance. Exhaustion is an explicit incomplete result, never an excuse for an unlimited continuation loop. Preserve the Responses API's required reasoning/output items across tool-call continuations; do not reconstruct history from assistant text alone. [Reasoning guide](https://developers.openai.com/api/docs/guides/reasoning)

## 3. Builder experience

Add a Build entry alongside existing right-panel modes and an entry on the dashboard for workspace tasks. Include a prompt, scope selector (Selection, Current board, Workspace task), effort selector, remaining allowance, and Run button. Default to Selection when objects are selected; creation tasks use empty visible space. Workspace tasks load only accessible resources, on demand.

The run presents short actionable states: Preparing, Building, Checking, Completed, Stopped, Budget reached, or Failed. Progress labels describe completed or pending editor actions; they do not expose private model reasoning. An optional short initial outline is followed by progressively applied operation batches.

Show a separate “Astra” cursor in board coordinates. Move it toward each operation's target, highlight the objects being changed, and update its activity label. Movement follows accepted operations; no unrelated decorative mouse movement. The native user cursor remains independent. Follow is opt-in and stops on manual pan/zoom. Honor reduced motion and throttle shared presence updates; interpolate cursor motion locally rather than writing every animation frame to storage.

Stop remains available during reasoning, streaming, and applying changes. Already-applied work stays editable and is marked as a partial build. Provide Undo build and a continuation prompt. Error states preserve the prompt, applied work, effective effort, and clear next actions. Manual navigation stops the current executor. Agent navigation checkpoints the old room and enters the next authorized room as an explicit operation. A disconnected tab does not silently continue building.

## 4. Execution architecture

Reuse `useEditorActionsCore`, `applyShapeMutation`, existing layout/geometry utilities, and the Liveblocks room. Liveblocks remains the sole live document authority; Supabase stores run metadata and billing records, not a competing canvas document.

Use one active browser executor per run. The backend produces validated operations from a shared capability registry. Canvas/UI operations run through native editor commands; persistent product/account operations use existing authenticated server handlers. Both paths share operation receipts, authorization, and idempotency. A durable executor lease prevents a second tab from consuming the same run. This avoids an extra Liveblocks connection per agent. Cross-board tasks acquire and release room leases explicitly.

Each model step is a bounded server request, not one indefinitely running Vercel function. Persist the step/run state before and after the request. Stream progress and complete operation proposals to the client. Only a fully parsed and validated tool call can produce an editor mutation; partial streamed JSON never touches the document.

Proposed authenticated API surface:

- `POST /api/builder/runs`: authorize board or workspace/account scope, validate prompt/effort, acquire user and applicable resource leases, reserve budget, create idempotent run. Account/dashboard runs do not require an open board.
- `POST /api/builder/runs/:id/step`: acquire the next-step lease, load bounded context, reserve that call's worst-case cost, stream one Responses API step.
- `POST /api/builder/runs/:id/operations/:opId/ack`: record the applied/rejected result for an issued operation. Accept only the designated executor and an operation that belongs to that run.
- `PATCH /api/builder/runs/:id`: change effort for subsequent steps or cancel. Reauthorize each request.
- `GET /api/builder/runs/:id`: return resumable status, last acknowledged sequence, and allowance information.

Adapt routes to Kumo's existing Vercel handler layout. Validate hosting timeouts and streaming before choosing the step deadline. If a request times out, preserve an uncertain state and reconcile it; do not blindly issue another paid call. Provider response IDs and usage are recorded when received. A timeout, aborted browser connection, or lost acknowledgement must not create duplicate calls or edits.

## 5. Editor tools and context

Create a typed capability registry covering every user-facing action. Each entry declares its stable ID, argument/result schemas, role requirements, target resource, executor (canvas, UI, or server), preconditions, undo/compensation behavior, and existing UI confirmation requirement. UI and agent execution share the underlying adapter; extract UI-only callbacks where necessary. Load domain-specific tool definitions on demand rather than sending hundreds of schemas on every request. Only registered capabilities can execute; there is no arbitrary-HTTP or arbitrary-code escape hatch.

Validate finite coordinates, dimensions, shape properties, text lengths, counts, parent relationships, references, and existing lock/visibility rules. Unlock, delete, publish, change access, and navigate boards are supported capabilities where the UI permits them. The user's task must authorize external/destructive effects; preserve the UI's existing confirmation steps. A model cannot approve its own confirmation prompt. Routine edits within the task proceed without per-operation confirmation. Discoverability follows the current role, and execution independently reauthorizes.

Send bounded scope, object summaries, design system, viewport, and request. Load further authorized resources only when the task needs them. Board text, comments, and imported content are untrusted data, never instructions that alter tool policy. Files come from accessible assets or an approved browser picker; no silent reading of arbitrary local files. Never send account secrets or unrelated private content.

### Full capability checklist

Inventory all tool definitions, menus, shortcuts, context menus, panels, dashboard/account screens, and user-reachable repository methods. Record each exact action in `src/builder/capabilityManifest.ts`. These domains must all be covered:

| Domain | Required agent capability |
| --- | --- |
| Canvas/navigation | Every drawing tool; selection/marquee; pan/zoom; guides/rulers/grid/snap; pages, sections, collections, saved views, linked-board navigation |
| Geometry/layers | Move, resize, rotate, flip, order, align, distribute, group/frame and inverses, rename, lock/unlock, hide/show, duplicate/delete, cut/copy/paste, undo/redo |
| Properties/text | Every inspector field: fills, strokes, gradients/stops, effects, opacity/blend, corners, typography, text runs, axes/features, text layout |
| Advanced drawing/layout | Vector points/handles, Boolean operations, flattening, masks, constraints, layout, connectors, every Advanced Studio operation |
| Design systems | Components/instances/variants/overrides; detach/reset/swap; styles, variables, collections/modes; libraries and release controls |
| Assets/files | Upload/reuse/place/edit/remove assets, fonts, cross-board asset copying, all supported import/export formats, downloads |
| Prototypes/inspection | Every interaction/transition and flow-start setting, preview/presentation, prototype sharing, developer inspection and copy operations |
| History/branches | Checkpoint/list/compare/restore, selected-layer restore, duplicate/share versions, create/update/review/merge/archive/restore branches |
| Product workflows | Requirements, flows, coverage checks/reports, findings/suppressions, policies/gates, telemetry, every Product and coverage panel action |
| Collaboration | Comments/replies/edit/delete/resolve, anchors, mentions, follow/spotlight, cursor chat, existing session controls |
| Boards/workspace | Create/open/rename/duplicate/trash/restore/permanent delete where available; folders, favorites, archive, templates, search, board links |
| Sharing/access | Share links, invitations, roles, access requests, revocation, ownership transfer, workspace membership where authorized |
| Account/preferences | Profile/avatar, friendships, notification preferences, sessions, and all account/admin controls the current user can access |

Every discovered user action needs an agent adapter and behavior test before this PR is complete. Use `useEditorActionsCore`, existing panel handlers, and board/asset/font/product/coverage/branch/version/collaborator/social/platform repositories. Disabled actions return the UI's reason. File pickers, reauthentication, and existing confirmations are supported user handoffs, not omitted capabilities. Check the manifest against the UI action registry in CI so future user actions cannot silently lack an agent adapter.

Run layout normalization and structural checks after each batch. Before completion check containment, connector references, text sizing, and obvious overlaps. Use a fixed repair-step limit. Establish a small evaluation set of representative prompts and manually inspect the resulting editable boards; passing schema validation alone does not demonstrate useful design quality.

## 6. Collaboration, idempotency, and undo

Use existing active-object claims for agent edits. Claims include run identity and expire when the executor disconnects. Recheck permissions and expected field values immediately before a batch is applied. If another person changes a targeted field, stop that operation and request fresh context instead of replacing their work. Changes on unrelated objects continue normally.

Add a bounded operation receipt map to the room schema. In the same Liveblocks batch, check an operation ID, apply its property-level mutations, and record its receipt. Retrying an acknowledged batch is a no-op. Add compatibility handling for older room schemas, snapshots, export/import, and receipt pruning; bookkeeping must not appear as a shape.

Persist before/after values for agent-owned field edits in an operation journal. Undo build applies inverse edits only where current fields still match what the agent wrote. Preserve subsequent collaborator changes, child additions, and references to newly created objects; report any conflicting items that cannot be safely undone. Do not restore a whole-board snapshot or pause the user's entire undo stack throughout a streamed run. Stop and permission loss release claims and prevent further operations.

Share compact agent activity through existing collaboration presence so collaborators see a labeled cursor without a second connection. For non-canvas actions, highlight the actual control/panel and show the result. Server-side changes have durable idempotency receipts and explicit compensation where supported. Already-sent notifications and completed irreversible actions are not advertised as undoable. The server owns run identity and spending; presence is display-only. Ignore late events after cancellation, lease expiry, navigation away from the executor, or terminal state.

## 7. Free access and abuse controls

Recommendation: no API-key entry for the first trial. Host a project-scoped OpenAI credential exclusively in Vercel. A visible free allowance is enforced in Supabase, with an optional personal-key path in this same PR if included in the final implementation scope.

Budget amounts below are proposed settings, not authorization to spend:

| Setting | Proposed initial value |
| --- | --- |
| Hosted AI enabled | Off until account access and budgets are configured |
| Free allowance | $1 equivalent of inference per verified account, lifetime |
| Maximum spend per run | $1, further limited by remaining account allowance |
| Global sponsored budget | $25/month and $5/day |
| Active runs | 1 per user, 1 per board, 2 sponsored provider requests globally |
| Maximum model calls | 6 per run, including repairs/retries |
| Output allowance | Dynamically bounded by reserved budget; up to 16,000 tokens per call |
| Maximum created objects | 100 per run, 25 per operation batch |

Pilot real prompts at every effort level before finalizing token/output limits. High effort may consume the available budget before producing a complete build. Surface this plainly; choosing Max never bypasses the same spending limits. Offer continuation only when funds remain.

Use atomic database reservations before every provider request. Account, per-run, daily, and monthly checks occur in one transaction; outstanding reservations count against all caps. Settle with reported input/cached-input/output usage, including reasoning-token billing. Use conservative uncached pricing for reservations, include any enabled service-tier multiplier, and fail closed if pricing/configuration is unknown. The server controls tools, model, token limits, and retry count regardless of client payload.

Rate-limit by authenticated identity and cautiously by IP; use escalation challenges for suspicious signup/run patterns. No anonymous sponsored generation. Account creation is not proof of uniqueness, so the global ceiling remains necessary. Add a kill switch and operator usage view. Treat provider budgets/alerts as a secondary control, not the application's spending ledger.

Current standard Astra pricing is $10/million input and $50/million output tokens. For example, 6,000 uncached input plus 2,000 total billed output tokens is $0.16 for one call; reasoning and further calls can increase a build's total. Keep the pricing table versioned and verify it before launch. [Model pricing](https://developers.openai.com/api/docs/models/gpt-6-astra)

Optional personal-key mode: session-only by default, transmitted over HTTPS, excluded from telemetry and logs, never written to localStorage or the board. An ephemeral server credential must have a short TTL and be encrypted if held outside process memory. Clear it on logout/session expiry. Durable “remember key” storage is outside V1. Personal-key requests still have scope, concurrency, and operation limits. Confirm the choice of adding this path before implementing its credential storage; the capped sponsored trial works independently.

## 8. Persistence and data boundaries

Add reviewed migrations for `builder_runs`, `builder_steps`, `builder_operations`, budget buckets, and usage reservations. Use unique idempotency keys, step leases, explicit terminal states, and transactional reservation/settlement procedures. Browser database roles remain revoked under Kumo's existing API-only architecture. Existing board authorization guards apply to run creation, status, continuation, cancellation, and history.

State transitions: created → preparing → awaiting_model → awaiting_apply → checking → completed. Stopped, failed, budget_exhausted, and interrupted are terminal or explicitly resumable outcomes. A resumed run starts from the last durable receipt and fresh board state, not a replay of the original document snapshot.

Keep prompts and bounded provider continuation data for active runs; choose and document a short retention period (proposed 7 days). Keep minimal usage/audit data separately from content. Use `store: false` where supported and manage required continuation items server-side; verify provider retention behavior before deployment. Users see that the chosen board context is sent to OpenAI. Never log API keys, full request headers, or raw board content in generic observability events.

## 9. Implementation sequence inside the single PR

1. Sidebar clearance and browser regression (started in this branch).
2. Inventory every user action and create the shared registry/parity manifest; add Astra configuration, effort controls, feature flag, and budget settings.
3. Typed adapters for all capability domains, scoped context, layout helpers, and validation/parity tests. Basic drawing is an internal milestone; complete the entire inventory before release.
4. Supabase run/budget schema, API authorization, atomic accounting, leases, and idempotency.
5. Responses adapter and bounded streamed step runner; deterministic provider fixtures before live calls.
6. Native editor executor, room receipts, conflict handling, agent cursor, Stop, Follow, and inverse-operation undo.
7. Builder panel, allowance/error states, effort changes, responsive/focus behavior, and optional personal-key mode if selected.
8. Evaluation prompts, browser/integration tests, docs, preview deployment, and a tightly budgeted live Astra canary.
9. Review the complete PR, pass existing gates, merge once, and verify production rollout with sponsored generation initially controlled by the feature flag.

Likely source additions: `src/builder/` for protocol/context/runtime and tests; `src/components/editor/BuilderPanel.tsx`; `src/components/editor/BuilderCursor.tsx`; `src/services/builderRepository.ts`; `server/api/handlers/builder.ts` with API route adapters; shared server budget/provider helpers; Supabase migrations; browser fixtures and builder E2E tests. Integrate into the existing panel switcher, collaboration room schema/presence, and editor command adapter.

## 10. Acceptance and release gates

- Reported sidebar controls are reachable above actual Liveblocks attribution; new builder controls use the same clearance.
- Astra and all five API effort choices are visible; the selected effort reaches the provider and changes at the advertised step boundary.
- Every user-facing action in the parity manifest has an agent adapter and test; no shape-only release. Verify dashboard, account, sharing, cross-board, and server operations as well as progressive canvas edits.
- Stop prevents new provider calls and queued/late client mutations. Reconcile already-in-flight server actions and usage accurately; do not promise to retract a completed external effect. Partial output stays available. Undo preserves other users' subsequent changes and identifies actions without a supported inverse.
- Duplicate start/step/ack requests, two tabs, reconnects, double-clicks, and retries cannot duplicate spending reservations or operations.
- Sponsorship eligibility is separate from action permissions. Viewers retain whatever read/export/comment actions the UI grants, but cannot edit through the agent. Guests have no sponsored inference. Revoked sessions and forged-resource requests cannot spend or act. Removed members cannot continue operations on resources they lost access to.
- Concurrent quota requests cannot exceed reserved limits; cancellation and uncertain usage cannot incorrectly refund paid requests.
- Invalid tool JSON, refusal, provider 401/429/5xx, output exhaustion, hosting timeout, disconnect, and unavailable model have tested recoverable UI states.
- No API keys appear in client bundles, logs, persisted board data, snapshots, or service-worker caches.
- Existing tests, 100% per-file coverage requirements, typecheck, lint, production artifact limits, browser suites, deployed canaries, and Lighthouse thresholds remain unchanged.
- Keep AI modules lazy so landing/login/ordinary board loads do not download an agent SDK or start paid work.
- Run a two-client collaboration test and a small, explicitly budgeted real-provider evaluation at every effort level; normal CI uses deterministic fixtures and makes no paid inference calls.

Open launch decisions: actual project credential and Astra access; accepted sponsored spending limits; whether optional personal-key entry belongs in this first PR. These do not block the sidebar fix or implementation planning, but sponsored production inference stays disabled until configured.
