# Fork with minimal changes

This fork implements these PRs:
- chore: muon-specific workflows, README [#27](https://github.com/Muon-Space/LibreChat/pull/27)
- feat: implement tool approval checks for agent tool calls [#28](https://github.com/Muon-Space/LibreChat/pull/28)
  - pending review upstream
- chore: sync upstream v0.8.6 [#31](https://github.com/Muon-Space/LibreChat/pull/31)
- ~~feat: data retention for conversations, messages, files, toolcalls, and sharedlinks [#29](https://github.com/Muon-Space/LibreChat/pull/29)~~
  - superseded: upstream merged and hardened the same feature; adopted wholesale in #31

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
