import { Router } from "express";
import { z } from "zod";
import {
  cancelRequest,
  createRequest,
  getRequestSummary,
  markArrived,
  submitFeedback,
} from "../lib/requests-engine.js";
import { asyncHandler } from "../lib/async-handler.js";

export const requestsRouter = Router();

const telemetrySchema = z
  .object({
    age: z.number().int().min(0).max(130).optional(),
    gender: z.enum(["M", "F", "Other"]).optional(),
    heartRate: z.number().int().min(20).max(300).optional(),
    bpSys: z.number().int().min(40).max(300).optional(),
    bpDia: z.number().int().min(20).max(200).optional(),
    spo2: z.number().int().min(40).max(100).optional(),
    gcs: z.number().int().min(3).max(15).optional(),
    acuity: z.enum(["red", "yellow", "green"]).optional(),
    notes: z.string().max(500).optional(),
  })
  .optional();

const createSchema = z.object({
  condition: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  mode: z.enum(["sequential", "parallel"]).default("sequential"),
  telemetry: telemetrySchema,
  preferredHospitalId: z.string().optional(),
});


requestsRouter.post(
  "/api/requests",
  asyncHandler(async (req, res) => {
    const parsed = createSchema.parse(req.body);
    const summary = await createRequest(parsed);
    res.status(201).json(summary);
  }),
);

requestsRouter.get("/api/requests/:id", (req, res) => {
  res.json(getRequestSummary(req.params.id));
});

requestsRouter.post(
  "/api/requests/:id/cancel",
  asyncHandler(async (req, res) => {
    await cancelRequest(req.params.id);
    res.json(getRequestSummary(req.params.id));
  }),
);

requestsRouter.post("/api/requests/:id/arrived", (req, res) => {
  markArrived(req.params.id);
  res.json(getRequestSummary(req.params.id));
});

const feedbackSchema = z.object({ bedWasThere: z.boolean() });

requestsRouter.post("/api/requests/:id/feedback", (req, res) => {
  const parsed = feedbackSchema.parse(req.body);
  submitFeedback(req.params.id, parsed.bedWasThere);
  res.json({ ok: true });
});
