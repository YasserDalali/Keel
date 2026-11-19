/** Time as a dependency, so domain code never calls `new Date()` itself. */
export interface Clock {
  now(): Date;
}
export const systemClock: Clock = { now: () => new Date() };

/** Calendar date in UTC, YYYY-MM-DD (the format due dates are stored in). */
export const dateOf = (d: Date): string => d.toISOString().slice(0, 10);

/** D1's CURRENT_TIMESTAMP format ("YYYY-MM-DD HH:MM:SS", UTC), which every reader of these columns expects. */
export const toSqlTimestamp = (d: Date): string => d.toISOString().replace("T", " ").slice(0, 19);

/** Parses a D1 timestamp ("YYYY-MM-DD HH:MM:SS", UTC) or an ISO string. */
export const fromSqlTimestamp = (s: string): Date => new Date(s.includes("T") ? s : `${s.replace(" ", "T")}Z`);
