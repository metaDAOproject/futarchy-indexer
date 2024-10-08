import { getMetrics } from "./endpoints/get-metrics";
import { logger } from "./logger";
import cors from "cors";
import express from "express";

const PORT = process.env.PORT ?? 8080;

export function startServer() {
  logger.log("starting server");
  const app = express();
  app.use(express.json());
  app.use(cors({ origin: "*", allowedHeaders: ["Content-Type"] }));
  app.get("/metrics", getMetrics);

  app.listen(PORT, () => {
    logger.log(`Server listening on Port ${PORT}`);
  });
}
