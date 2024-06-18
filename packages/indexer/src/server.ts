import { authGet, authPost, authPut } from "./endpoints/auth";
import { getMetrics } from "./endpoints/get-metrics";
import { logger } from "./logger";
import cors from "cors";
import express from "express";

const PORT = 8080;

export function startServer() {
  const app = express();
  app.use(express.json());
  app.use(cors({ origin: "*" }));
  app.get("/metrics", getMetrics);
  app.post("/auth", authPost);
  app.put("/auth", authPut);
  app.get("/auth", authGet);

  app.listen(PORT, () => {
    logger.log(`Server listening on Port ${PORT}`);
  });
}
