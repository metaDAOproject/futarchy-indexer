import express from "express";
import { Registry, collectDefaultMetrics } from "@lukasdeco/prom-client";
import { logger } from './logger';

const METRICS_PORT = 8080;

export function startMetricsServer() {
  const register = new Registry();
  register.setDefaultLabels({
    app: "futarchy-indexer",
  });
  collectDefaultMetrics({
    register,
    excludedMetrics: [
      "nodejs_eventloop_lag_seconds",
      "nodejs_heap_space_size_total_bytes",
    ],
  });

  const app = express();

  // TODO: add authz layer to all API calls
  app.get("/metrics", function (_, res) {
    res.setHeader("Content-Type", register.contentType);

    register.metrics().then((data) => {
      res.status(200).send(data);
    });
  });

  app.listen(METRICS_PORT, () => {
    logger.log(`Prometheus Metrics Servier listening on Port ${METRICS_PORT}`);
  });
}
