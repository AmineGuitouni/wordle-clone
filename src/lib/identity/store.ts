import "server-only";
import { getCollections, type IdentityDocument } from "@/lib/db";

/** Identities minted before identities were recorded get this creation date, so they count as established. */
export const LEGACY_IDENTITY_CREATED_AT = new Date(0);

/** Records a freshly minted identity. Its creation time decides when its wins start to rank. */
export async function recordNewIdentity(id: string, name: string, now = new Date()): Promise<void> {
  const { identities } = await getCollections();
  await identities.insertOne({ _id: id, name, createdAt: now, lastSeenAt: now });
}

/**
 * Notes a returning identity and its current name. An identity without a record predates them, so it gets one
 * with the legacy creation date rather than "now" (which would wrongly make it look brand new).
 */
export async function recordReturningIdentity(id: string, name: string, now = new Date()): Promise<void> {
  const { identities } = await getCollections();
  await identities.updateOne(
    { _id: id },
    { $set: { name, lastSeenAt: now }, $setOnInsert: { createdAt: LEGACY_IDENTITY_CREATED_AT } },
    { upsert: true },
  );
}

export async function findIdentity(id: string): Promise<IdentityDocument | null> {
  const { identities } = await getCollections();
  return identities.findOne({ _id: id });
}
