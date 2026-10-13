import { createHash, createSign, generateKeyPairSync, randomBytes, type KeyObject } from "node:crypto";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL, isoCBOR } from "@simplewebauthn/server/helpers";

/**
 * A software passkey for tests: it answers WebAuthn options exactly like a browser plus authenticator would
 * (P-256 key, "none" attestation, real signatures), so the server-side verification runs for real.
 */
const FLAG_USER_PRESENT = 0x01;
const FLAG_ATTESTED_CREDENTIAL = 0x40;

const sha256 = (data: Uint8Array | string) => new Uint8Array(createHash("sha256").update(data).digest());
const b64 = (data: Uint8Array | string) =>
  isoBase64URL.fromBuffer(typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data));
const uint32 = (value: number) =>
  new Uint8Array([value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
const uint16 = (value: number) => new Uint8Array([value >>> 8, value & 255]);
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

export class SoftAuthenticator {
  private readonly rawId = new Uint8Array(randomBytes(16));
  private readonly privateKey: KeyObject;
  private readonly cosePublicKey: Uint8Array;
  private counter = 0;
  /** The user handle (base64url) the site gave this passkey when it was created. */
  userHandle: string | undefined;

  constructor(private readonly origin: string) {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.privateKey = privateKey;
    const { x, y } = publicKey.export({ format: "jwk" });
    // COSE_Key: kty EC2, alg ES256, crv P-256, x, y.
    this.cosePublicKey = isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, new Uint8Array(Buffer.from(x!, "base64url"))],
        [-3, new Uint8Array(Buffer.from(y!, "base64url"))],
      ]),
    );
  }

  get id(): string {
    return isoBase64URL.fromBuffer(this.rawId);
  }

  /** What `navigator.credentials.create()` would resolve to. */
  register(
    options: PublicKeyCredentialCreationOptionsJSON,
    { origin = this.origin }: { origin?: string } = {},
  ): RegistrationResponseJSON {
    this.userHandle = options.user.id;
    const clientData = JSON.stringify({ type: "webauthn.create", challenge: options.challenge, origin });
    const authData = concat(
      sha256(options.rp.id ?? new URL(origin).hostname),
      new Uint8Array([FLAG_USER_PRESENT | FLAG_ATTESTED_CREDENTIAL]),
      uint32(this.counter),
      new Uint8Array(16), // AAGUID: unknown authenticator model
      uint16(this.rawId.length),
      this.rawId,
      this.cosePublicKey,
    );
    const attestationObject = isoCBOR.encode(
      new Map<string, string | Uint8Array | Map<string, string>>([
        ["fmt", "none"],
        ["attStmt", new Map<string, string>()],
        ["authData", authData],
      ]),
    );
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64(clientData),
        attestationObject: b64(attestationObject),
        transports: ["internal"],
      },
    };
  }

  /** What `navigator.credentials.get()` would resolve to. */
  authenticate(
    options: PublicKeyCredentialRequestOptionsJSON,
    { origin = this.origin, rpId = options.rpId ?? new URL(origin).hostname }: { origin?: string; rpId?: string } = {},
  ): AuthenticationResponseJSON {
    this.counter++;
    const clientData = new TextEncoder().encode(
      JSON.stringify({ type: "webauthn.get", challenge: options.challenge, origin }),
    );
    const authData = concat(sha256(rpId), new Uint8Array([FLAG_USER_PRESENT]), uint32(this.counter));
    const signature = createSign("SHA256")
      .update(concat(authData, sha256(clientData)))
      .sign(this.privateKey);
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64(clientData),
        authenticatorData: b64(authData),
        signature: b64(new Uint8Array(signature)),
        userHandle: this.userHandle,
      },
    };
  }
}
