# Astra live builder

The signed-in **Build with Astra** launcher opens the builder without loading its editor and API modules during ordinary landing/login. The Liveblocks free attribution remains visible; inspector controls have 80px plus safe-area scroll clearance. The builder has separate clearance above the badge.

## Use

Choose Selection, Current board, or Workspace task; describe the result; choose low, medium, high, xhigh, or max effort. The model is always `gpt-6-astra`, default effort low. Changing effort during a run affects the next provider request. Real document changes, a labeled cursor, an optional Follow control, and the action log show progress. Manual canvas interaction disables Follow. Stop cancels inference and prevents new operations; a completed in-flight effect is still acknowledged.

No end-user API key is required. Hosting is disabled by default. The UI explains that relevant board content is sent to OpenAI. Local files require the browser picker. Sharing, destructive repository actions, and existing dialogs require a user handoff. Password inputs and builder/attribution controls are excluded from observed UI controls.

## Capability coverage

`scripts/generate-builder-capabilities.mjs` derives schemas from every exported user-facing editor/repository action: 180 native actions in editor, assets, boards, branches, collaborators, coverage, fonts, platform/account, product, social, and versions. The generated JSON is checked during typecheck. Native actions use the existing functions and authorization. Canvas capabilities cover every Shape field/type, inspection, selection, viewport, background, structural checks, and run undo. Observed-control adapters cover UI-only tools, panels, comments, shortcuts, downloads, and settings. Workspace navigation reconnects to the selected board before continuing.

Editor commands receive explicit selection IDs so a human selection change cannot redirect an issued action. Selection scope restricts document mutations to selected objects and descendants; broader UI/account actions require a broader scope. This is an agent inside Kumo, not arbitrary browser/OS or code execution.

## Server configuration

Apply `supabase/migrations/202609140001_astra_builder.sql` before deploying this release. All four builder tables and transition/pruning functions are restricted to the service role. Browser Supabase access remains revoked.

Configure these **server-only** Vercel variables (never `VITE_`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | absent | Project-scoped OpenAI credential |
| `KUMO_BUILDER_ENABLED` | false | Hosted inference switch |
| `KUMO_BUILDER_USER_USD` | 1 | Lifetime sponsored allowance per verified account |
| `KUMO_BUILDER_RUN_USD` | 1 | Per-run ceiling |
| `KUMO_BUILDER_DAY_USD` | 5 | Global UTC daily ceiling |
| `KUMO_BUILDER_MONTH_USD` | 25 | Global UTC monthly ceiling |
| `KUMO_BUILDER_ADMIN_UIDS` | empty | Comma-separated operator Firebase UIDs |

The numeric defaults are configuration proposals, not spending authorization. Keep the switch false until the owner accepts budgets and configures the credential. Do not send credentials in chat, logs, or the PR. Redeploy after changing runtime configuration. Disabling hosted inference blocks new create/step calls; already-running requests may finish or be stopped by their executor.

Before enabling publicly, verify account access to `gpt-6-astra` and current pricing/usage fields, then run a tightly budgeted pilot at all five efforts: a roadmap, a selected-frame mockup, an existing-board restyle, connectors/layout, and a workspace navigation task. Assess editable output quality and latency. This paid pilot has not run because this workspace has no OpenAI credential. CI never makes paid inference requests.

## Spending, recovery, and operations

Each request reserves allowance atomically against account, run, day, and month buckets. Limits include outstanding reservations. The server allows one active run per account/board, two concurrent sponsored provider requests, six model requests per run, up to 16,000 output tokens per request, and 100 created objects per run. Identity/IP rate limits precede inference. Inputs are bounded well below the long-context tier. Conservative byte-based reservations can stop a complex run before its nominal allowance is spent.

Pricing dated 2026-09-13: ordinary input $10/M, cached input $1/M, cache writes $12.50/M, and output including reasoning $50/M. Cache writes replace ordinary input pricing for those tokens. Requests explicitly use the default service tier. Reservations assume worst-case cache-write input pricing; settlement uses reported token categories. Missing usage, unknown accounting, timeouts, and disconnects retain the full reserved amount. There are no automatic paid retries. Check official pricing before enabling or changing this table: [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).

Operators can open **Operator usage** for the last 50 runs and reserved/uncertain provider requests. The read-only API is `GET /api/builder?scope=usage`. Inspect `provider_response_id`, reported usage, and the OpenAI project usage before reconciling an uncertain request. There is deliberately no automatic refund or replay for an unknown outcome. Expired reservations can remain in `reserved_micros`; settled-unknown requests remain charged in `spent_micros`. Any manual accounting correction must update all four recorded `bucket_keys` in one transaction and retain an audit record. Never simply delete a reservation to free allowance.

Runs have a five-minute executor lease. Resume requires the original board/branch and no uncertain paid step or started operation. Session recovery stores only run/lease/scope/selection/board metadata, not prompts or keys. A started repository action with no acknowledgment is not replayed automatically. Repository operations retain their existing server authorization and cannot promise reversal of already-sent notifications or irreversible actions.

Liveblocks document mutations and receipts share an atomic storage batch. Existing object baselines, locks, destination locks, and human/agent activity claims are rechecked. Run undo reverses unchanged fields, preserving later collaborator edits and referenced created objects. It covers document edits, not arbitrary workspace/account actions. Presence expires after 15 seconds and is cleared on Stop/disconnect. The maintenance job prunes prompt/provider content and operation results after seven days; accounting remains. Room receipts are pruned on mutation to seven days and 512 entries. OpenAI requests use `store:false` and encrypted reasoning continuation; this does not override the OpenAI account's provider retention policy.

## Verification

Run typecheck (including registry parity), lint, 100% per-file unit coverage, production artifact checks, and database migration/RLS tests. The three-browser builder fixture checks action order, effort choices, and disabled hosting; inspector tests check attribution clearance. The deployed full-stack canary uses two real Liveblocks clients with deterministic inference replies to verify progressive creation, visible Astra presence, durable receipts, and undo while preserving the human-edited object. Preview deployment, authenticated canaries, and Lighthouse remain required merge gates.
