import { Router } from "express";
import { releaseHold } from "../lib/requests-engine.js";

export const holdsRouter = Router();

holdsRouter.post("/api/holds/:id/release", (req, res) => {
  releaseHold(req.params.id);
  res.json({ ok: true });
});
