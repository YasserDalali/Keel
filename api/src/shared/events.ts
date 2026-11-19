/** Something that happened in the domain, named in the past tense. */
export interface DomainEvent {
  readonly type: string;
  readonly occurredAt: Date;
}

type Handler<E extends DomainEvent> = (event: E) => Promise<void> | void;

/**
 * In-process publish/subscribe. Contexts react to each other's events instead of calling each other.
 * Handlers run in order and are isolated: one failing is logged and never fails the command that raised the event
 * (the same guarantee notifications and emails had before). Consequence: cross-context effects are eventually
 * consistent and must be idempotent.
 */
export class EventBus {
  private readonly handlers = new Map<string, Handler<DomainEvent>[]>();

  subscribe<E extends DomainEvent>(type: E["type"], handler: Handler<E>): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler as Handler<DomainEvent>);
    this.handlers.set(type, list);
  }

  async publish(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      for (const handler of this.handlers.get(event.type) ?? []) {
        try {
          await handler(event);
        } catch (e) {
          console.error(`[event] handler for ${event.type} failed:`, (e as Error).message);
        }
      }
    }
  }
}
