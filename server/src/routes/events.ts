import { Router } from "express";
import { z } from "zod";
import { BED_TYPES } from "../config/index.js";
import { applyBedUpdate } from "../lib/beds.js";
import { getHospital } from "../lib/hospitals.js";
import { notFound } from "../lib/errors.js";

export const eventsRouter = Router();

const SOURCES = ["nurse_tap", "telegram", "phoned_in", "sim_feed", "crew_feedback", "estimate"] as const;

const eventBodySchema = z
  .object({
    hospitalId: z.string().min(1),
    bedType: z.enum(BED_TYPES as [string, ...string[]]),
    delta: z.number().int().optional(),
    value: z.number().int().min(0).optional(),
    source: z.enum(SOURCES),
    actor: z.string().trim().min(1).max(80).optional(),
    note: z.string().trim().max(200).optional(),
  })
  .refine((data) => data.delta !== undefined || data.value !== undefined, {
    message: "Provide delta or value.",
  });

/** Generic ingestion point for any source — the simulated feed, a CSV importer, a phoned-in patch, etc. */
eventsRouter.post("/api/events", (req, res) => {
  const parsed = eventBodySchema.parse(req.body);
  if (!getHospital(parsed.hospitalId)) throw notFound(`Unknown hospital: ${parsed.hospitalId}`);

  const snapshot = applyBedUpdate({
    hospitalId: parsed.hospitalId,
    bedType: parsed.bedType as (typeof BED_TYPES)[number],
    delta: parsed.delta,
    value: parsed.value,
    source: parsed.source,
    actor: parsed.actor,
    note: parsed.note,
    eventType: parsed.source,
  });

  res.json({ bed: snapshot });
});
