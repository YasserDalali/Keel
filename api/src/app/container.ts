import { systemClock } from "../shared/clock";
import { EventBus } from "../shared/events";
import { uuidGenerator } from "../shared/ids";
import type { Bindings } from "../types";
import { wireBorrower } from "./wiring/borrower";
import { wireCommunication } from "./wiring/communication";
import { wireDocuments } from "./wiring/documents";
import { wireIdentity } from "./wiring/identity";
import { wireLending } from "./wiring/lending";
import { wirePayments } from "./wiring/payments";
import { wireReporting } from "./wiring/reporting";

/**
 * Composition root: the only place that knows which concrete classes implement which ports.
 * Built once per environment (a Worker isolate's bindings don't change), then reused for every request.
 * Each context is wired in its own file under ./wiring; contexts talk to each other through the event bus.
 */
export function buildServices(env: Bindings) {
  const bus = new EventBus();
  const clock = systemClock;
  const ids = uuidGenerator;

  const lending = wireLending(env, bus, clock, ids);
  const w = { env, bus, clock, ids, lending };
  const identity = wireIdentity(w);
  const borrower = wireBorrower(w);
  const services = {
    lending,
    payments: wirePayments(w),
    communication: wireCommunication(w),
    documents: wireDocuments(w, { identity, borrower }),
    identity,
    borrower,
    reporting: wireReporting(w),
  };

  return services;
}

export type Services = ReturnType<typeof buildServices>;

const cache = new WeakMap<object, Services>();
export function servicesFor(env: Bindings): Services {
  let s = cache.get(env);
  if (!s) cache.set(env, (s = buildServices(env)));
  return s;
}
