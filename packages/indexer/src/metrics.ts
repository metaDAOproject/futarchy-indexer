import Prometheus from "@lukasdeco/prom-client";
import express from "express";

const METRICS_PORT = 8080;

export function startMetricsServer() {
  const register = new Prometheus.Registry();
  register.setDefaultLabels({
    app: "futarchy-indexer",
  });
  Prometheus.collectDefaultMetrics({
    register,
    excludedMetrics: [
      "nodejs_eventloop_lag_seconds",
      "nodejs_heap_space_size_total_bytes",
    ],
  });

  const app = express();

  app.get("/metrics", function (_, res) {
    res.setHeader("Content-Type", register.contentType);

    register.metrics().then((data) => {
      res.status(200).send(data);
    });
  });

  app.listen(METRICS_PORT, () => {
    console.log("Prometheus Metrics Servier listening on Port", METRICS_PORT);
  });
}
