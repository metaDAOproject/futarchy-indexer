// handlers.ts
import { Request, Response } from "express";
import { eq, and, gt } from "drizzle-orm";
import { usingDb } from "@metadaoproject/indexer-db";
import { sessions, users } from "@metadaoproject/indexer-db/lib/schema";
import { AUTHENTICATION_TIME, verifySignature } from "../usecases/auth";
import { logger } from "../logger";

//TODO: These endpoints need to be changed so that you must send signature as part of the auth header.
// Sending just the pubkey in the body would mean an inflight session can be easily hijacked

const SESSION_NOT_FOUND_ERROR = {
  error: "Session doesn't exist or has expired",
};
const WRONG_REQUEST_BODY_ERROR = { error: "Wrong request body." };

async function checkExistingSession(pubkey: string) {
  const currentTime = new Date();
  const resp = await usingDb((db) =>
    db
      .select()
      .from(sessions)
      .where(
        and(eq(sessions.userAcct, pubkey), gt(sessions.expiresAt, currentTime))
      )
  );

  return resp.length ? resp[0] : null;
}

export async function authPost(req: Request, res: Response) {
  try {
    const { pubKey } = req.body;
    if (!pubKey) return res.status(400).json(WRONG_REQUEST_BODY_ERROR);

    const existingSession = await checkExistingSession(pubKey);
    if (existingSession) {
      return res
        .status(200)
        .json({ sessionId: existingSession.id, wasLoggedIn: true });
    }

    await usingDb((db) =>
      db.insert(users).values({ userAcct: pubKey }).onConflictDoNothing()
    );
    const [newSession] = await usingDb((db) =>
      db
        .insert(sessions)
        .values({
          userAcct: pubKey,
        })
        .returning()
    );

    return res
      .status(200)
      .json({ sessionId: newSession.id, wasLoggedIn: false });
  } catch (e: any) {
    console.error(e);
    return res.status(400).json({ error: e.message });
  }
}

export async function authPut(req: Request, res: Response) {
  try {
    const { id, signature, pubKey } = req.body;
    if (!pubKey || !signature || !id)
      return res.status(400).json(WRONG_REQUEST_BODY_ERROR);
    if (!verifySignature(signature, pubKey, id))
      return res.status(400).json({ error: "Invalid signature" });

    const currentTime = new Date();
    const expiryTime = new Date(
      currentTime.getTime() + AUTHENTICATION_TIME * 60000
    );

    const existingSession = await checkExistingSession(pubKey);
    if (existingSession) {
      return res.status(409).json({
        error: "Session already exists and has not expired.",
        sessionId: existingSession.id,
      });
    }

    await usingDb((db) =>
      db.insert(users).values({ userAcct: pubKey }).onConflictDoNothing()
    );
    const [updatedSession] = await usingDb((db) =>
      db
        .update(sessions)
        .set({ userAcct: pubKey, expiresAt: expiryTime })
        .where(eq(sessions.id, id))
        .returning()
    );

    return res.status(200).json({
      sessionId: updatedSession.id,
      message: "Message signed successfully.",
    });
  } catch (e: any) {
    console.error(e);
    return res.status(400).json({ error: e.message });
  }
}

export async function authGet(req: Request, res: Response) {
  try {
    const { pubkey } = req.body;

    const existingSession = await checkExistingSession(pubkey);
    if (!existingSession) return res.status(400).json(SESSION_NOT_FOUND_ERROR);

    return res
      .status(200)
      .json({ message: "Session valid.", sessionId: existingSession.id });
  } catch (e: any) {
    console.error(e);
    return res.status(400).json({ error: e.message });
  }
}
