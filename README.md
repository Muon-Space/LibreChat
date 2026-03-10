# Fork with minimal changes

This fork implements these PRs:
- chore: muon-specific workflows, README [#16](https://github.com/Muon-Space/LibreChat/pull/16)
- feat: implement tool approval checks for agent tool calls [#17](https://github.com/Muon-Space/LibreChat/pull/17)
  - pending review upstream
- feat: data retention for conversations, messages, files, toolcalls, and sharedlinks [#18](https://github.com/Muon-Space/LibreChat/pull/18)
  - pending review upstream

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

db.conversations.updateMany(
  { isTemporary: { $exists: false } },
  { $set: { isTemporary: false } }
)
```
