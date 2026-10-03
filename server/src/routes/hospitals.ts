import { Router } from "express";
import { z } from "zod";
import { getHospital, listHospitalsWithBeds, setHospitalDiversion } from "../lib/hospitals.js";
import { broadcast } from "../lib/sse.js";
import { notFound } from "../lib/errors.js";

export const hospitalsRouter = Router();

hospitalsRouter.get("/api/hospitals", (_req, res) => {
  res.json({ hospitals: listHospitalsWithBeds() });
});

const diversionSchema = z.object({
  isDiverted: z.boolean(),
  reason: z.string().optional(),
  durationMinutes: z.number().int().min(1).max(1440).optional(),
});

hospitalsRouter.post("/api/hospitals/:id/diversion", (req, res) => {
  const hospital = getHospital(req.params.id);
  if (!hospital) throw notFound("Hospital not found.");

  const body = diversionSchema.parse(req.body);
  const diversion = setHospitalDiversion({
    hospitalId: hospital.id,
    isDiverted: body.isDiverted,
    reason: body.reason,
    durationMinutes: body.durationMinutes,
  });

  broadcast("diversion", {
    hospitalId: hospital.id,
    isDiverted: diversion.isDiverted,
    reason: diversion.reason,
    divertedUntil: diversion.divertedUntil,
  });

  res.json({ diversion });
});

hospitalsRouter.delete("/api/hospitals/:id/diversion", (req, res) => {
  const hospital = getHospital(req.params.id);
  if (!hospital) throw notFound("Hospital not found.");

  const diversion = setHospitalDiversion({
    hospitalId: hospital.id,
    isDiverted: false,
  });

  broadcast("diversion", {
    hospitalId: hospital.id,
    isDiverted: false,
  });

  res.json({ diversion });
});

