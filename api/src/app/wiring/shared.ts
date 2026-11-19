import type { Clock } from "../../shared/clock";
import type { EventBus } from "../../shared/events";
import type { IdGenerator } from "../../shared/ids";
import type { Bindings } from "../../types";
import type { LendingServices } from "./lending";

/** What every context's wiring receives: the environment, the shared kernel, and the contexts built before it. */
export type Wiring = { env: Bindings; bus: EventBus; clock: Clock; ids: IdGenerator; lending: LendingServices };
