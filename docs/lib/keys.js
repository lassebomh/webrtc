// @ts-check

const publicKeyOptions = { crv: "P-256", ext: true, key_ops: /** @type {string[]} */ ([]), kty: "EC", x: "", y: "" };

/**
 * @typedef {string & { readonly _: unique symbol }} ID
 */

/**
 * @typedef {string & { readonly _: unique symbol }} SharedID
 */

/**
 * @typedef {{ publicKey: JsonWebKey; privateKey: JsonWebKey }} ExportedIdentity
 */

/**
 * @typedef {object} IdentityHandler
 * @property {ID} id
 * @property {(id: ID) => Promise<SharedID>} derivedSharedId
 * @property {() => Promise<ExportedIdentity>} export
 * @property {(...args: any[]) => void} log
 * @property {(...args: any[]) => void} debug
 * @property {(...args: any[]) => void} warn
 */

/** @type {Map<string, number>} */
let identityIndicies = new Map();

/**
 * @param {string} id
 * @returns {number}
 */
function identityIndex(id) {
  let index = identityIndicies.get(id);
  if (index === undefined) {
    index = identityIndicies.size;
    identityIndicies.set(id, index);
  }
  return index;
}

/**
 * @param {ID} id
 */
function createLoggers(id) {
  identityIndex(id);

  /**
   * @param {any[]} args
   * @returns {string[]}
   */
  function colorizeStrings(...args) {
    /** @type {string[]} */
    let fmt = [];
    args.unshift(id, "::");
    const newArgs = args.map((arg) => {
      if (typeof arg === "string") {
        const ids = [...identityIndicies.keys()];
        if (ids.length === 0) return arg;
        const pattern = new RegExp(ids.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
        return arg.replace(pattern, (match) => {
          const index = /** @type {number} */ (identityIndicies.get(match));
          fmt.push(
            `color: white; font-weight: 700; background-color: hsl(${index * 137.5}deg 100% 50%); border-radius: 999rem;`,
            "",
          );
          return "%c  %c";
        });
      } else {
        return `${arg}`;
      }
    });
    return [newArgs.join(" "), ...fmt];
  }

  return {
    /** @param {any[]} args */
    debug(...args) {
      console.debug(...colorizeStrings(...args));
    },
    /** @param {any[]} args */
    log(...args) {
      console.log(...colorizeStrings(...args));
    },
    /** @param {any[]} args */
    warn(...args) {
      console.warn(...colorizeStrings(...args));
    },
  };
}

/**
 * @param {ID} id
 * @param {CryptoKeyPair} cryptoKeyPair
 * @returns {IdentityHandler}
 */
function buildHandler(id, cryptoKeyPair) {
  return {
    id,
    ...createLoggers(id),
    async export() {
      const [publicKey, privateKey] = await Promise.all([
        crypto.subtle.exportKey("jwk", cryptoKeyPair.publicKey),
        crypto.subtle.exportKey("jwk", cryptoKeyPair.privateKey),
      ]);
      return { publicKey, privateKey };
    },
    /** @param {ID} id */
    async derivedSharedId(id) {
      identityIndex(id);
      const [x, y] = id.split("$");
      /** @type {JsonWebKey} */
      const webKey = { ...publicKeyOptions, x, y };
      const publicKey = await crypto.subtle.importKey("jwk", webKey, { name: "ECDH", namedCurve: "P-256" }, true, []);
      const sharedSecretBuffer = await crypto.subtle.deriveBits(
        { name: "ECDH", public: publicKey },
        cryptoKeyPair.privateKey,
        256,
      );
      const secretTopic = /** @type {SharedID} */ (
        window.btoa([...new Uint8Array(sharedSecretBuffer)].map((x) => String.fromCharCode(x)).join(""))
      );
      return secretTopic;
    },
  };
}

/**
 * @returns {Promise<IdentityHandler>}
 */
export async function createIdentityHandler() {
  const cryptoKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveKey",
    "deriveBits",
  ]);
  const exported = await crypto.subtle.exportKey("jwk", /** @type {CryptoKeyPair} */ (cryptoKeyPair).publicKey);
  const id = /** @type {ID} */ (exported.x + "$" + exported.y);
  return buildHandler(id, /** @type {CryptoKeyPair} */ (cryptoKeyPair));
}

/**
 * @param {ExportedIdentity} exported
 * @returns {Promise<IdentityHandler>}
 */
export async function importIdentityHandler(exported) {
  const params = { name: "ECDH", namedCurve: "P-256" };
  const [publicKey, privateKey] = await Promise.all([
    crypto.subtle.importKey("jwk", exported.publicKey, params, true, []),
    crypto.subtle.importKey("jwk", exported.privateKey, params, true, ["deriveKey", "deriveBits"]),
  ]);
  const cryptoKeyPair = /** @type {CryptoKeyPair} */ ({ publicKey, privateKey });
  const id = /** @type {ID} */ (exported.publicKey.x + "$" + exported.publicKey.y);
  return buildHandler(id, cryptoKeyPair);
}

/**
 * @returns {Promise<IdentityHandler>}
 */
export async function getDefaultIdentity() {
  /** @type {IdentityHandler | undefined} */
  let identity;
  try {
    const persistedIdentityValue = sessionStorage.getItem("keys");

    if (persistedIdentityValue) {
      const parsed = JSON.parse(persistedIdentityValue);
      identity = await importIdentityHandler(parsed);
    }
  } catch (e) {
    console.error("Failed to load identity. Creating new one");
    console.error(e);
  }

  if (!identity) {
    identity = await createIdentityHandler();
    const exported = await identity.export();
    sessionStorage.setItem("keys", JSON.stringify(exported));
  }
  return identity;
}
