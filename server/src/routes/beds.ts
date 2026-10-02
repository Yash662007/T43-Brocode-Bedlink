import { Router } from "express";
import { z } from "zod";
import { BED_TYPES } from "../config/index.js";
import { requireToken } from "../lib/auth.js";
import { applyBedUpdate, listBedEvents, logBedEvent } from "../lib/beds.js";
import { badRequest } from "../lib/errors.js";

export const bedsRouter = Router();

const bedTypeSchema = z.enum(BED_TYPES as [string, ...string[]]);

const updateBodySchema = z
  .object({
    bedType: bedTypeSchema,
    delta: z.number().int().optional(),
    value: z.number().int().min(0).optional(),
    stillCorrect: z.boolean().optional(),
    actor: z.string().trim().min(1).max(80).optional(),
    isRestore: z.boolean().optional(),
  })
  .refine(
    (data) =>
      [data.delta !== undefined, data.value !== undefined, data.stillCorrect === true].filter(
        Boolean,
      ).length === 1,
    { message: "Provide exactly one of delta, value, or stillCorrect." },
  );

bedsRouter.post("/api/beds/:hospitalToken", (req, res) => {
  const { hospitalToken } = req.params;
  const parsed = updateBodySchema.parse(req.body);
  const auth = requireToken(hospitalToken, ["nurse"]);

  const snapshot = applyBedUpdate({
    hospitalId: auth.hospital_id,
    bedType: parsed.bedType as (typeof BED_TYPES)[number],
    delta: parsed.delta,
    value: parsed.value,
    stillCorrect: parsed.stillCorrect,
    source: "nurse_tap",
    actor: parsed.actor,
    eventType: parsed.stillCorrect
      ? "nurse_confirmed"
      : parsed.isRestore
        ? "restored"
        : "nurse_applied",
  });

  res.json({ bed: snapshot });
});

const phonedInBodySchema = z.object({
  token: z.string().min(1),
  bedType: bedTypeSchema,
  value: z.number().int().min(0),
  actor: z.string().trim().min(1).max(80).optional(),
});

bedsRouter.post("/api/beds/phoned-in", (req, res) => {
  const parsed = phonedInBodySchema.parse(req.body);
  const auth = requireToken(parsed.token, ["data_desk"]);

  const snapshot = applyBedUpdate({
    hospitalId: auth.hospital_id,
    bedType: parsed.bedType as (typeof BED_TYPES)[number],
    value: parsed.value,
    source: "phoned_in",
    actor: parsed.actor,
    eventType: "phoned_in",
  });

  res.json({ bed: snapshot });
});

const proposeBodySchema = z.object({
  changes: z
    .array(
      z.object({
        bedType: bedTypeSchema,
        previousFree: z.number().int().min(0),
        nextFree: z.number().int().min(0),
      }),
    )
    .min(1),
});

/** Logs an AI-suggested change for audit history without applying it — the nurse must still confirm. */
bedsRouter.post("/api/beds/:hospitalToken/propose", (req, res) => {
  const auth = requireToken(req.params.hospitalToken, ["nurse"]);
  const parsed = proposeBodySchema.parse(req.body);

  for (const change of parsed.changes) {
    logBedEvent({
      hospitalId: auth.hospital_id,
      bedType: change.bedType as (typeof BED_TYPES)[number],
      eventType: "ai_proposed",
      previousFree: change.previousFree,
      nextFree: change.nextFree,
      source: "estimate",
      actor: "ai-review",
    });
  }

  res.json({ ok: true });
});

bedsRouter.get("/api/beds/:hospitalToken/history", (req, res) => {
  const auth = requireToken(req.params.hospitalToken, ["nurse", "data_desk"]);
  const limit = Number(req.query["limit"] ?? 50);
  if (!Number.isFinite(limit) || limit < 1 || limit > 200) {
    throw badRequest("limit must be between 1 and 200.");
  }
  res.json({ history: listBedEvents(auth.hospital_id, limit) });
});
