import type { Request, Response } from "express";

type SseEvent = { event: string; data: unknown };

const clients = new Set<Response>();
const HEARTBEAT_MS = 20000;

export function sseHandler(req: Request, res: Response) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders?.();
  res.write(": connected\n\n");

  clients.add(res);
  req.on("close", () => {
    clients.delete(res);
  });
}

export function broadcast(event: string, data: unknown) {
  const payload: SseEvent = { event, data };
  const chunk = `event: ${event}\ndata: ${JSON.stringify(payload.data)}\n\n`;
  for (const client of clients) {
    client.write(chunk);
  }
}

// unref so plain scripts that import this module (seed, simulate) can exit
// naturally; the long-running server process still keeps polling clients.
const heartbeat = setInterval(() => {
  for (const client of clients) {
    client.write(": ping\n\n");
  }
}, HEARTBEAT_MS);
heartbeat.unref();
