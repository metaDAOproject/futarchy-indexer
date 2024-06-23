import bs58 from "bs58";
import nacl from "tweetnacl";

export const AUTHENTICATION_TIME = 3;

export function authMessage(pubKey: string, nonce: number) {
  const message = `Sign this message to authenticate current wallet (${publicKeyEllipsis(
    pubKey
  )}) for ${AUTHENTICATION_TIME} minutes. \n\nid :\n${nonce}`;

  return new TextEncoder().encode(message);
}

export function publicKeyEllipsis(publicKey: string | undefined) {
  if (!publicKey) {
    return null;
  }

  if (publicKey.length <= 8) {
    return publicKey;
  }

  const start = publicKey.substring(0, 4);
  const end = publicKey.substring(publicKey.length - 4, publicKey.length);
  return `${start}...${end}`;
}

export function verifySignature(signature: string, pubkey: string, id: number) {
  try {
    const publicKeyBuffer = bs58.decode(pubkey);
    const signatureBuffer = bs58.decode(signature);
    const messageBuffer = authMessage(pubkey, id);

    // Verify the signature
    const isValid = nacl.sign.detached.verify(
      messageBuffer,
      signatureBuffer,
      publicKeyBuffer
    );
    return isValid;
  } catch (e) {
    console.error(e);
  }
}
