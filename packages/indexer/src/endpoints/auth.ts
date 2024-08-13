import jwt from "jsonwebtoken";
import { Request, Response } from "express";
import { usingDb, eq, gt, and } from "@metadaoproject/indexer-db";
import { sessions, users } from "@metadaoproject/indexer-db/lib/schema";
import { AUTHENTICATION_TIME, verifySignature } from "../usecases/auth";

const SESSION_NOT_FOUND_ERROR = {
  error: "Session doesn't exist or has expired",
};

const WRONG_REQUEST_BODY_ERROR = { error: "Wrong request body." };

const PRIVATE_KEY =
  process.env.RSA_PRIVATE_KEY ||
  `-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----`;

// Function to check for an existing session
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

// PUT endpoint for authentication
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
    if (existingSession && existingSession.expiresAt) {
      const token = jwt.sign(
        {
          sub: existingSession.id,
          pubKey,
          iat: Math.floor(existingSession.createdAt.getTime() / 1000), // Issued at
          exp: Math.floor(existingSession.expiresAt?.getTime() / 1000), // Expiry time
          "https://hasura.io/jwt/claims": {
            "x-hasura-default-role": "user",
            "x-hasura-allowed-roles": ["user"],
            "x-hasura-user-id": pubKey,
          },
        },
        PRIVATE_KEY, // Use the RSA private key to sign the JWT
        { algorithm: "RS256" } // Specify the RS256 algorithm
      );
      return res.status(200).json({
        message: "Session already exists and has not expired.",
        sessionId: existingSession.id,
        expiryTime,
        token, // Include the JWT in the response
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

    const token = jwt.sign(
      {
        sub: updatedSession.id,
        pubKey,
        iat: Math.floor(currentTime.getTime() / 1000), // Issued at
        exp: Math.floor(expiryTime.getTime() / 1000), // Expiry time
        "https://hasura.io/jwt/claims": {
          "x-hasura-default-role": "user",
          "x-hasura-allowed-roles": ["user"],
          "x-hasura-user-id": pubKey,
        },
      },
      PRIVATE_KEY, // Use the RSA private key to sign the JWT
      { algorithm: "RS256" } // Specify the RS256 algorithm
    );

    return res.status(200).json({
      sessionId: updatedSession.id,
      message: "Message signed successfully.",
      expiryTime,
      token, // Include the JWT in the response
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
