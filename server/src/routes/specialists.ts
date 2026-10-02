import { Router } from "express";
import { z } from "zod";
import { requireToken } from "../lib/auth.js";
import { listSpecialistStatus, setSpecialistOnCall } from "../lib/capabilities.js";
import { capabilitiesConfig } from "../config/index.js";
import { badRequest } from "../lib/errors.js";
import { broadcast } from "../lib/sse.js";

export const specialistsRouter = Router();

const bodySchema = z.object({ capability: z.string().min(1), isOn: z.boolean() });

specialistsRouter.post("/api/specialists/:hospitalToken", (req, res) => {
  const parsed = bodySchema.parse(req.body);
  if (!capabilitiesConfig.capabilities[parsed.capability]) {
    throw badRequest(`Unknown capability: ${parsed.capability}`);
  }
  const auth = requireToken(req.params.hospitalToken, ["nurse"]);

  setSpecialistOnCall({
    hospitalId: auth.hospital_id,
    capability: parsed.capability,
    isOn: parsed.isOn,
    source: "nurse_tap",
  });

  broadcast("specialist", {
    hospitalId: auth.hospital_id,
    specialists: listSpecialistStatus(auth.hospital_id),
  });

  res.json({ ok: true });
});
