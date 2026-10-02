import { Router } from "express";
import { z } from "zod";
import { acceptOffer, rejectOffer, getRequestSummary } from "../lib/requests-engine.js";
import { db } from "../db/index.js";
import { notFound } from "../lib/errors.js";

export const offersRouter = Router();

function requestIdForOffer(offerId: string): string {
  const row = db.prepare(`SELECT request_id FROM offers WHERE id = ?`).get(offerId) as
    | { request_id: string }
    | undefined;
  if (!row) throw notFound("Offer not found.");
  return row.request_id;
}

offersRouter.post("/api/offers/:id/accept", (req, res) => {
  const result = acceptOffer(req.params.id);
  const requestId = requestIdForOffer(req.params.id);
  res.json({ ...result, request: getRequestSummary(requestId) });
});

const rejectSchema = z.object({ reason: z.string().trim().max(120).optional() });

offersRouter.post("/api/offers/:id/reject", (req, res) => {
  const parsed = rejectSchema.parse(req.body ?? {});
  rejectOffer(req.params.id, parsed.reason);
  const requestId = requestIdForOffer(req.params.id);
  res.json({ request: getRequestSummary(requestId) });
});
