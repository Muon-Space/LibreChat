# Fork with minimal changes

This fork implements these PRs:
- ~~feat: Gemini Image Generation Tool (Nano Banana) [#10676](https://github.com/danny-avila/LibreChat/pull/10676)~~
  - implemented upstream!
- ~~feat: Anthropic Vertex AI Support [#10780](https://github.com/danny-avila/LibreChat/pull/10780)~~
  - implemented upstream!
- ~~feat: add hide "base" models flag to model spec [#10915](https://github.com/danny-avila/LibreChat/pull/10915)~~
  - rejected, but workaround was provided instead
- feat: implement tool approval checks for agent tool calls [#12152](https://github.com/danny-avila/LibreChat/pull/12152)
  - pending review upstream
- Feat: support data retention for normal chats [#10532](https://github.com/danny-avila/LibreChat/pull/10532)
  - pending review upstream
- feat: updating expiration for multiple different collections [#15](https://github.com/Muon-Space/LibreChat/pull/15)
  - internal change to add retention policy on each impacted collection

This fork implements these custom changes:
- Removed all workflows
  - added just one workflow to build/push the image
    - this is built with more optimization for build speeds
- Updated README.md

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
