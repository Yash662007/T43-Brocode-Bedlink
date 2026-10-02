import { Router } from "express";
import { z } from "zod";
import { rankHospitalsForCondition } from "../lib/dispatch-rank.js";
import { conditionsConfig } from "../config/index.js";
import { badRequest } from "../lib/errors.js";
import { asyncHandler } from "../lib/async-handler.js";

export const dispatchRouter = Router();

const rankBodySchema = z.object({
  condition: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
});

dispatchRouter.get("/api/conditions", (_req, res) => {
  res.json({
    conditions: Object.entries(conditionsConfig.conditions).map(([id, entry]) => ({
      id,
      label: entry.label,
      bedType: entry.bedType,
    })),
  });
});

dispatchRouter.post(
  "/api/dispatch/rank",
  asyncHandler(async (req, res) => {
    const parsed = rankBodySchema.parse(req.body);
    const result = await rankHospitalsForCondition({
      condition: parsed.condition,
      origin: { lat: parsed.lat, lng: parsed.lng },
    });
    if (!result) throw badRequest(`Unknown condition: ${parsed.condition}`);

    res.json({ bedType: result.bedType, hospitals: result.ranked });
  }),
);
