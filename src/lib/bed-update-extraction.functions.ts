import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { extractBedAvailabilityUpdate } from "./bed-update-extraction.server";

export const reviewBedAvailabilityNote = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ note: z.string().trim().min(3) }).parse(data))
  .handler(async ({ data }) => extractBedAvailabilityUpdate(data.note));
