import { Request, Response } from "express";
import { Registry, collectDefaultMetrics } from "@lukasdeco/prom-client";

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

export async function getMetrics(_: Request, res: Response) {
  res.setHeader("Content-Type", register.contentType);

  const data = await register.metrics();
  res.status(200).send(data);
}
