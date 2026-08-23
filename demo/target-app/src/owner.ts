/**
 * Owner display codes. Item ownership is a required column on items
 * (see schema.sql), so callers can format an owner for any row.
 */
export function ownerCode(userId: number): string {
  return `U-${userId.toString().padStart(6, "0")}`;
}

export function ownerLabel(userId: number): string {
  return `user-${userId}`;
}
