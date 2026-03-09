const path = require('path');
const { logger } = require('@librechat/data-schemas');

require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');

const { Conversation, Message, File, ToolCall, SharedLink } = require('~/db/models');

const DEFAULT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

async function backfillCollection(Model, collectionName, retentionMs) {
  const filter = {
    $or: [{ expiredAt: null }, { expiredAt: { $exists: false } }],
  };

  const total = await Model.countDocuments(filter);
  if (total === 0) {
    logger.info(`[${collectionName}] No documents to backfill`);
    return 0;
  }

  logger.info(`[${collectionName}] Backfilling ${total} documents...`);

  const batchSize = 500;
  let processed = 0;
  let cursor = Model.find(filter).select('_id createdAt').lean().cursor({ batchSize });

  let bulkOps = [];
  for await (const doc of cursor) {
    const createdAt = doc.createdAt || new Date();
    bulkOps.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { expiredAt: new Date(createdAt.getTime() + retentionMs) } },
      },
    });

    if (bulkOps.length >= batchSize) {
      await Model.bulkWrite(bulkOps);
      processed += bulkOps.length;
      logger.info(`[${collectionName}] Processed ${processed}/${total}`);
      bulkOps = [];
    }
  }

  if (bulkOps.length > 0) {
    await Model.bulkWrite(bulkOps);
    processed += bulkOps.length;
  }

  logger.info(`[${collectionName}] Backfill complete: ${processed} documents updated`);
  return processed;
}

async function main() {
  await connect();

  const retentionMs = parseInt(process.env.RETENTION_MS) || DEFAULT_RETENTION_MS;
  const retentionDays = Math.round(retentionMs / (24 * 60 * 60 * 1000));
  logger.info(`Backfilling expiredAt with ${retentionDays}-day retention period`);

  const results = {
    conversations: await backfillCollection(Conversation, 'conversations', retentionMs),
    messages: await backfillCollection(Message, 'messages', retentionMs),
    files: await backfillCollection(File, 'files', retentionMs),
    toolcalls: await backfillCollection(ToolCall, 'toolcalls', retentionMs),
    sharedlinks: await backfillCollection(SharedLink, 'sharedlinks', retentionMs),
  };

  logger.info('Backfill summary:', results);
  process.exit(0);
}

main().catch((err) => {
  logger.error('Backfill failed:', err);
  process.exit(1);
});
