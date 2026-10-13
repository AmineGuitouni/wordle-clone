import "server-only";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { COSEALG } from "@simplewebauthn/server/helpers";
import { Binary, MongoServerError } from "mongodb";
import { getCollections } from "@/lib/db";
import { toBase64Url } from "./crypto";
import {
  consumePasskeyChallenge,
  createPasskeyChallenge,
  readPasskeyChallenge,
  type Ceremony,
} from "./passkey-challenge";
import { findIdentity, recordReturningIdentity } from "./store";

/**
 * Passkeys let a player carry their device identity to another browser or device without an email or a password:
 * the passkey is created on one device (and synced by iCloud Keychain, Google Password Manager, ...), and signing
 * in with it on another device issues that device the same identity cookie.
 *
 * The WebAuthn user handle is the identity id, so a device keeps one passkey per identity. No user verification
 * is required: the passkey stands in for a cookie, not for a password.
 */
const RP_NAME = "Guess the Word";
/**
 * What every passkey provider supports. Spelled out because the library's default probes Node for experimental
 * post-quantum algorithms, which prints an ExperimentalWarning in production logs.
 */
const ALGORITHMS = [COSEALG.EdDSA, COSEALG.ES256, COSEALG.RS256];
const DUPLICATE_KEY_ERROR = 11000;
const encoder = new TextEncoder();

/** Who the passkeys belong to: the site's origin and its host name (the WebAuthn "relying party" id). */
export type RelyingParty = { origin: string; rpID: string };

export function relyingPartyFor(origin: string): RelyingParty {
  return { origin, rpID: new URL(origin).hostname };
}

type Player = { id: string; name: string };

export async function hasPasskey(userId: string): Promise<boolean> {
  const { passkeys } = await getCollections();
  return (await passkeys.countDocuments({ userId }, { limit: 1 })) > 0;
}

export async function startPasskeyRegistration(
  player: Player,
  rp: RelyingParty,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const { passkeys } = await getCollections();
  const existing = await passkeys.find({ userId: player.id }, { projection: { transports: 1 } }).toArray();

  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp.rpID,
    userName: player.name,
    userDisplayName: player.name,
    userID: encoder.encode(player.id),
    challenge: await createPasskeyChallenge("register", player.id),
    attestationType: "none",
    // Lets the browser say "this device already has one" instead of creating a duplicate.
    excludeCredentials: existing.map(({ _id, transports }) => ({ id: _id, transports })),
    // Discoverable, so signing in needs no username: the device offers the passkeys it holds for this site.
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    supportedAlgorithmIDs: ALGORITHMS,
  });
}

/** Runs a SimpleWebAuthn verification against our stateless challenge; resolves to its result only if it passed. */
async function verifyWith<T extends { verified: boolean }>(
  expected: { ceremony: Ceremony; userId?: string },
  verify: (expectedChallenge: (challenge: string) => Promise<boolean>) => Promise<T>,
): Promise<T | null> {
  const challenge: { nonce: string | null } = { nonce: null };
  let result: T;
  try {
    result = await verify(async (echoed) => {
      challenge.nonce = await readPasskeyChallenge(echoed, expected);
      return challenge.nonce !== null;
    });
  } catch {
    // SimpleWebAuthn throws for any malformed or failing response (wrong origin, bad signature, ...).
    return null;
  }
  // Single use, and only spent once everything else checked out.
  if (!result.verified || !challenge.nonce || !(await consumePasskeyChallenge(challenge.nonce))) return null;
  return result;
}

/** Verifies a new passkey for `player` and stores it. Resolves to whether it was accepted. */
export async function finishPasskeyRegistration(player: Player, response: unknown, rp: RelyingParty) {
  const verified = await verifyWith({ ceremony: "register", userId: player.id }, (expectedChallenge) =>
    verifyRegistrationResponse({
      response: response as RegistrationResponseJSON,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: false,
      supportedAlgorithmIDs: ALGORITHMS,
    }),
  );
  const info = verified?.registrationInfo;
  if (!info) return false;

  const { passkeys } = await getCollections();
  try {
    await passkeys.insertOne({
      _id: info.credential.id,
      userId: player.id,
      publicKey: new Binary(info.credential.publicKey),
      counter: info.credential.counter,
      transports: info.credential.transports ?? [],
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      createdAt: new Date(),
      lastUsedAt: null,
    });
  } catch (error) {
    if (!(error instanceof MongoServerError && error.code === DUPLICATE_KEY_ERROR)) throw error;
    // The same credential again: fine for its owner, never transferable to someone else.
    const owner = await passkeys.findOne({ _id: info.credential.id }, { projection: { userId: 1 } });
    if (owner?.userId !== player.id) return false;
  }

  // Signing in elsewhere restores the name and creation date from this record, so make sure it exists.
  await recordReturningIdentity(player.id, player.name);
  return true;
}

export async function startPasskeySignIn(rp: RelyingParty): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return generateAuthenticationOptions({
    rpID: rp.rpID,
    userVerification: "preferred",
    challenge: await createPasskeyChallenge("sign-in"),
  });
}

function credentialId(response: unknown): string | null {
  const id = (response as { id?: unknown } | null)?.id;
  return typeof id === "string" && id.length > 0 && id.length <= 1024 ? id : null;
}

/** Verifies a passkey sign-in. Resolves to the identity it belongs to, or null if it can't be trusted. */
export async function finishPasskeySignIn(response: unknown, rp: RelyingParty): Promise<Player | null> {
  const id = credentialId(response);
  if (!id) return null;

  const { passkeys } = await getCollections();
  const passkey = await passkeys.findOne({ _id: id });
  if (!passkey) return null;

  const assertion = response as AuthenticationResponseJSON;
  const userHandle = assertion.response?.userHandle;
  if (userHandle && userHandle !== toBase64Url(encoder.encode(passkey.userId))) return null;

  const verified = await verifyWith({ ceremony: "sign-in" }, (expectedChallenge) =>
    verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      credential: {
        id: passkey._id,
        publicKey: passkey.publicKey.value().slice(),
        counter: passkey.counter,
        transports: passkey.transports,
      },
      requireUserVerification: false,
    }),
  );
  if (!verified) return null;

  const { newCounter, credentialBackedUp } = verified.authenticationInfo;
  await passkeys.updateOne(
    { _id: passkey._id },
    { $set: { counter: newCounter, backedUp: credentialBackedUp, lastUsedAt: new Date() } },
  );

  const identity = await findIdentity(passkey.userId);
  return { id: passkey.userId, name: identity?.name ?? "Guest" };
}
