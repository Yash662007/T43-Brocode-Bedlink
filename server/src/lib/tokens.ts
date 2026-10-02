import { db } from "../db/index.js";
import { newId, nowIso } from "./ids.js";

export type HospitalToken = {
  token: string;
  hospital_id: string;
  role: "nurse" | "data_desk" | "telegram";
  label: string | null;
  created_at: string;
};

export function resolveToken(token: string): HospitalToken | undefined {
  return db.prepare(`SELECT * FROM hospital_tokens WHERE token = ?`).get(token) as
    | HospitalToken
    | undefined;
}

export function createToken(params: {
  hospitalId: string;
  role: HospitalToken["role"];
  label?: string;
  token?: string;
}): string {
  const token = params.token ?? newId("tok");
  db.prepare(
    `INSERT INTO hospital_tokens (token, hospital_id, role, label, created_at)
     VALUES (@token, @hospitalId, @role, @label, @createdAt)`,
  ).run({
    token,
    hospitalId: params.hospitalId,
    role: params.role,
    label: params.label ?? null,
    createdAt: nowIso(),
  });
  return token;
}
