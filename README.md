# Fork with minimal changes

This fork implements these PRs:
- chore: muon-specific workflows, README [#27](https://github.com/Muon-Space/LibreChat/pull/27)
- chore: sync upstream v0.8.6 [#31](https://github.com/Muon-Space/LibreChat/pull/31)
- chore: sync upstream v0.8.7 [#32](https://github.com/Muon-Space/LibreChat/pull/32)
- chore: sync upstream/main post-v0.8.7; adopt native HITL tool approval [#33](https://github.com/Muon-Space/LibreChat/pull/33)
- ~~feat: implement tool approval checks for agent tool calls [#28](https://github.com/Muon-Space/LibreChat/pull/28)~~
  - superseded: upstream shipped native HITL tool approval post-v0.8.7; adopted wholesale in #33
- ~~feat: data retention for conversations, messages, files, toolcalls, and sharedlinks [#29](https://github.com/Muon-Space/LibreChat/pull/29)~~
  - superseded: upstream merged and hardened the same feature; adopted wholesale in #31

## Upstream sync HEAD → release 8.0.1 (2026-07-15, direct merge)

Merged `danny-avila/LibreChat` @ `4321f68f2` (33 commits since the #33 sync point)
directly to main and tagged **8.0.1**. Routine: no toolApproval/checkpointer schema
changes (deployed HITL config unaffected), no new Mongo indexes, README-only conflict.
Notable: HITL hardening (ask_user_question resume #14254, Redis stream resume guard
#14258), mid-run steering + queued messages (#14220), background tool calls (#14197),
`@librechat/agents` v3.2.65, GPT-5.6 models, MCP session teardown/OAuth fixes.

## Upstream sync post-v0.8.7 HEAD (2026-07-14, PR #33)

Merged `danny-avila/LibreChat` @ `cf9a426d2` (upstream/main HEAD, 80 commits past the
v0.8.7 tag). **This is a pre-release snapshot** — we are intentionally tracking main to
adopt upstream's native HITL early, and we commit to reconciling with the v0.8.8 release
tag when it emerges (expected to be a routine sync since our delta is now minimal).

### Tool approval (#28) retired → upstream native HITL

Upstream's human-in-the-loop runtime (danny-avila#12938, #13942, #14025, #14139)
supersedes our fork's tool approval. It uses the **same yaml key**
(`endpoints.agents.toolApproval`) with an incompatible, richer schema, so coexistence
was impossible — resolved exactly like data retention in #31: take upstream, drop ours.
The fork delta vs upstream is now **workflows + README only**.

What upstream's version adds over ours: durable pause/resume across replicas/restarts
(Mongo checkpoints) instead of our 3-minute in-request SSE wait, deny rules, argument
editing before approval, `ask_user_question`, programmatic policy hooks, and SDK-level
interception that uniformly covers regular, MCP, and PTC tool calls.

**Config migration (deployed librechat.yaml) — REQUIRED when upgrading:**

Old (fork) schema → new (upstream) schema:

```yaml
# BEFORE (fork #28)               # AFTER (upstream HITL)
toolApproval:                     toolApproval:
  required: true                    enabled: true
  excluded: ["calculator"]          mode: default          # unmatched tools -> ask
                                    allow: ["calculator"]  # skip approval
```

Semantics of the new policy (mirrors Claude Code's permission vocabulary):
- Precedence: `deny` → (`mode: bypass` → allow-all) → `allow` → `ask` → mode fallthrough
  (`default` = ask, `dontAsk` = deny).
- Patterns are anchored globs (`*` wildcard). MCP tool names are matched raw in
  LibreChat's registered form `{tool}_mcp_{server}` — e.g. all tools of server
  `github` = `*_mcp_github`, all MCP tools = `*_mcp_*`.
- Our old `required: true` + `excluded: [...]` form maps exactly to
  `enabled: true, mode: default, allow: [...]`.
- ⚠️ Our old `required: [list]` form ("ask only for these, run everything else") has
  **no exact static equivalent**: `allow` beats `ask`, and only `bypass` auto-approves
  unmatched tools but `bypass` also skips `ask`. If that shape is needed, use upstream's
  programmatic `hooks:` config (`toolApproval.hooks`), or accept `mode: default` with a
  broad `allow` list.
- HITL is **default-off**: without `enabled: true` no approval prompts happen at all.
  Verify the deployed librechat.yaml is migrated in the same release as this image, or
  tool gating silently disappears.

### Ops notes for this sync (all additive)

- With `toolApproval.enabled: true`, two new Mongo collections appear on demand:
  `agent_checkpoints` + `agent_checkpoint_writes` (TTL-indexed, default 24h — tune via
  `endpoints.agents.checkpointer.ttl`). Zero-config: defaults to the app's MongoDB.
- New `toolfavorites` collection (unique compound index) and one new `sharedlinks`
  index (`updatedAt: -1`) — autoIndex creates at boot; for `MONGO_AUTO_INDEX=false`:
  ```js
  db.toolfavorites.createIndex({ user: 1, itemType: 1, itemId: 1 }, { unique: true });
  db.sharedlinks.createIndex({ updatedAt: -1 });
  ```
- Langfuse fanout is new and opt-in (`LANGFUSE_FANOUT_ENABLED`, separate compose/helm
  overlays) — not part of our deployment.
- `@librechat/agents` bumps to ^3.2.61 (carries the HITL/ToolPolicy machinery).

## Upstream sync v0.8.7 (2026-07-14, PR #32)

Merged `danny-avila/LibreChat` @ `9e74cc0e5` (v0.8.7 release tag, 111 commits past
the v0.8.6 sync point).

- **Tool approval (#28) preserved** — upstream did not touch `MCP.js` in this range;
  `ToolService.js` changes were execute_code/bash authorization hardening and did not
  add new tool-execution paths, so both wrap sites (agent + PTC) still cover everything.
- **Heads-up for the next sync:** upstream is building native HITL tool approval
  (`packages/api/src/agents/hitl/` — danny-avila#12938, #13942, #14025, #14139), all
  landed *after* the v0.8.7 tag. Expect it to supersede our tool approval in v0.8.8+
  the same way retention was superseded in #31 — resolve take-upstream and migrate the
  `toolApproval` yaml config to upstream's policy hooks when that happens.
- Workflow policy reapplied: removed upstream's new `retry-docker-builds`,
  `config-review`, `docker-smoke`, `playwright-mock`, `sync-helm-chart-tags` workflows.

### Ops notes for v0.8.7 (no destructive migration)

- New `auditlogs` collection with 4 indexes — created at boot by autoIndex. Only if
  the deployment runs `MONGO_AUTO_INDEX=false`, create manually:
  ```js
  db.auditlogs.createIndex({ chainKey: 1, seq: 1 }, { unique: true });
  db.auditlogs.createIndex({ chainKey: 1, createdAt: -1, seq: -1 });
  db.auditlogs.createIndex({ chainKey: 1, category: 1, createdAt: -1 });
  db.auditlogs.createIndex({ chainKey: 1, 'target.type': 1, 'target.id': 1, createdAt: -1 });
  ```
- Schema changes are additive only (convo `pinned`, message `quotes`, sharedlink
  file snapshots, preset `promptCacheTtl`/`url_context`). No index drops/changes to
  existing collections.
- New env vars, all optional for our deployment: `ADMIN_PANEL_SESSION_SECRET` (only
  needed if running upstream's bundled admin panel via docker-compose — we don't),
  `SHARED_LINKS_SNAPSHOT_FILES` (default **enabled**: shared links now snapshot file
  metadata so viewers can preview files; set `false` or
  `interface.sharedLinks.snapshotFiles: false` to opt out),
  `FILE_PREVIEW_MAX_EXTRACT_BYTES`, `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` support.
- Config schema version is now 1.3.13; our `toolApproval` block is unchanged.

## Upstream sync v0.8.6 (2026-06-11, PR #31)

Merged `danny-avila/LibreChat` @ `139d61c43` (316 commits, v0.8.5 → v0.8.6).

- **Data retention is now upstream's native implementation.** Our adaptation of
  danny-avila#10532 (PR #29) was dropped in favor of upstream's merged + hardened
  version (danny-avila#13049, #13394, #13424, #13477). Same `retentionMode` config
  key; new `retainAgentFiles` option; file expiry is now swept by application code
  instead of a Mongo TTL index (the TTL deleted only metadata and could destroy
  persistent agent resource files).
- **Tool approval (#28) preserved** and re-seated onto upstream's request-scoped MCP
  connection restructure; approval gating now also covers the PTC execution path.
- Remaining fork delta vs upstream: tool approval + muon workflow/README only.
- Build system migrated to tsdown upstream — run a clean `npm run reinstall` after pulling.

### Mongo migration for v0.8.6 (run once per environment)

```js
// ---- REQUIRED: files index, TTL -> plain.
// The app sweeps file expiry itself now (hourly, FILE_RETENTION_SWEEP_INTERVAL_MS).
// A leftover TTL index keeps hard-deleting file metadata, including agent files.
// Boot-time autoIndex cannot fix this (same index name, different options).
const fileIdx = db.files.getIndexes().find((ix) => ix.name === 'expiredAt_1');
if (fileIdx && fileIdx.expireAfterSeconds !== undefined) {
  db.files.dropIndex('expiredAt_1');
}
db.files.createIndex({ expiredAt: 1 });

// ---- REQUIRED: retention compound indexes.
// autoIndex creates the new ones at boot (creates are idempotent here for
// deployments running MONGO_AUTO_INDEX=false); Mongo never drops superseded ones.
db.conversations.createIndex({ user: 1, isTemporary: 1, expiredAt: 1 });
db.conversations.createIndex({ _meiliIndex: 1, isTemporary: 1, expiredAt: 1 });
db.messages.createIndex({ _meiliIndex: 1, isTemporary: 1, expiredAt: 1 });
for (const coll of [db.conversations, db.messages]) {
  if (coll.getIndexes().some((ix) => ix.name === '_meiliIndex_1_expiredAt_1')) {
    coll.dropIndex('_meiliIndex_1_expiredAt_1');
  }
}

// ---- OPTIONAL (policy decision): retain persistent agent resource files.
// Our 2026-04 backfill stamped expiredAt on ALL files. The new sweeper deletes any
// file with a past expiredAt and does NOT exclude agent files, so without this
// repair, agent resource files still get deleted as their stale dates lapse.
// Pair with `interface.retainAgentFiles: true` in librechat.yaml so NEW agent
// uploads are also exempt under retentionMode: "all".
const agentFileIds = new Set();
db.agents.find({}, { tool_resources: 1 }).forEach((agent) => {
  const resources = agent.tool_resources || {};
  for (const key of Object.keys(resources)) {
    (resources[key].file_ids || []).forEach((id) => agentFileIds.add(id));
  }
});
const res = db.files.updateMany(
  { file_id: { $in: [...agentFileIds] }, expiredAt: { $ne: null } },
  { $unset: { expiredAt: 1 } },
);
print(`agent files: cleared expiredAt on ${res.modifiedCount} of ${agentFileIds.size} referenced`);
```

Notes:
- conversations, messages, toolcalls, and sharedlinks keep their TTL indexes — no
  changes there beyond the superseded compound indexes above.
- The old files TTL deleted only metadata documents, so storage blobs (S3/local)
  from the TTL era may be orphaned and are not recoverable through the app.
- Switching `retentionMode` from "all" back to "temporary"? First unset `expiredAt`
  on non-temporary conversations/messages (see comments in `librechat.example.yaml`).

## History

### Initial data retention rollout (2026-04, PR #29 — superseded by #31)

We ran these mongosh commands:
```js
db.conversations.createIndex({ expiredAt: 1 }, { expireAfterSeconds: 0 })
db.messages.createIndex({ expiredAt: 1 }, { expireAfterSeconds: 0 })
db.files.createIndex({ expiredAt: 1 }, { expireAfterSeconds: 0 })
db.toolcalls.createIndex({ expiredAt: 1 }, { expireAfterSeconds: 0 })
db.sharedlinks.createIndex({ expiredAt: 1 }, { expireAfterSeconds: 0 })

const retentionMs = 90 * 24 * 60 * 60 * 1000;
const collections = ["conversations", "messages", "files", "toolcalls", "sharedlinks"];
const batchSize = 1000;

for (const name of collections) {
  const coll = db.getCollection(name);
  let ops = [];
  let count = 0;
  coll.find(
    { $or: [{ expiredAt: null }, { expiredAt: { $exists: false } }] },
    { _id: 1, createdAt: 1 }
  ).forEach(function(doc) {
    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { expiredAt: new Date(doc.createdAt.getTime() + retentionMs) } }
      }
    });
    if (ops.length >= batchSize) {
      coll.bulkWrite(ops);
      count += ops.length;
      print(name + ": " + count + " so far...");
      ops = [];
    }
  });
  if (ops.length > 0) {
    coll.bulkWrite(ops);
    count += ops.length;
  }
  print(name + ": " + count + " updated");
}
```
