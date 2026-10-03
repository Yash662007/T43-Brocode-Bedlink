import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { ZodError } from "zod";
import { hospitalsRouter } from "./routes/hospitals.js";
import { bedsRouter } from "./routes/beds.js";
import { eventsRouter } from "./routes/events.js";
import { dispatchRouter } from "./routes/dispatch.js";
import { requestsRouter } from "./routes/requests.js";
import { offersRouter } from "./routes/offers.js";
import { holdsRouter } from "./routes/holds.js";
import { streamRouter } from "./routes/stream.js";
import { specialistsRouter } from "./routes/specialists.js";
import { analyticsRouter } from "./routes/analytics.js";
import { HttpError } from "./lib/errors.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use(hospitalsRouter);
  app.use(bedsRouter);
  app.use(eventsRouter);
  app.use(dispatchRouter);
  app.use(requestsRouter);
  app.use(offersRouter);
  app.use(holdsRouter);
  app.use(streamRouter);
  app.use(specialistsRouter);
  app.use(analyticsRouter);


  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof ZodError) {
      res.status(400).json({ error: "Invalid request.", details: err.issues });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Something went wrong." });
  };
  app.use(errorHandler);

  return app;
}
