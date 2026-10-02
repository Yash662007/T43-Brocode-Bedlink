import { Router } from "express";
import { sseHandler } from "../lib/sse.js";

export const streamRouter = Router();

streamRouter.get("/api/stream", sseHandler);
