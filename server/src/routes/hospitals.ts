import { Router } from "express";
import { listHospitalsWithBeds } from "../lib/hospitals.js";

export const hospitalsRouter = Router();

hospitalsRouter.get("/api/hospitals", (_req, res) => {
  res.json({ hospitals: listHospitalsWithBeds() });
});
