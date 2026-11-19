/**
 * The one rule about lateness that lending and reporting must agree on: an installment that is not fully paid
 * and whose due date (YYYY-MM-DD) is before today is overdue. It lives in the shared kernel, deliberately tiny and
 * owned jointly, so the two contexts can stay independent everywhere else without this rule ever drifting apart.
 */
export const effectiveInstallmentStatus = <S extends string>(status: S, dueDate: string, today: string): S | "overdue" =>
  status !== "paid" && dueDate < today ? "overdue" : status;
