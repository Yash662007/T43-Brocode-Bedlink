import { resolveToken, type HospitalToken } from "./tokens.js";
import { unauthorized } from "./errors.js";

export function requireToken(token: string, allowedRoles: HospitalToken["role"][]): HospitalToken {
  const resolved = resolveToken(token);
  if (!resolved) throw unauthorized("Unknown or revoked token.");
  if (!allowedRoles.includes(resolved.role)) throw unauthorized("This token cannot do that.");
  return resolved;
}
