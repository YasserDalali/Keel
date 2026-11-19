/** Money as a value object: whole cents, immutable. Replaces scattered `Math.round(x * 100) / 100`. */
export class Money {
  static readonly zero = new Money(0);

  private constructor(readonly cents: number) {}

  static ofCents(cents: number): Money {
    if (!Number.isSafeInteger(cents)) throw new RangeError(`Money needs whole cents, got ${cents}`);
    return new Money(cents);
  }

  /** Rounds to the nearest cent. */
  static fromDollars(dollars: number): Money {
    if (!Number.isFinite(dollars)) throw new RangeError(`Money needs a finite amount, got ${dollars}`);
    return new Money(Math.round(dollars * 100));
  }

  get dollars(): number {
    return this.cents / 100;
  }

  plus(o: Money): Money { return new Money(this.cents + o.cents); }
  minus(o: Money): Money { return new Money(this.cents - o.cents); }
  /** Multiplies and rounds to the nearest cent (rates, percentages). */
  times(factor: number): Money { return new Money(Math.round(this.cents * factor)); }
  /** Never below zero. */
  floorAtZero(): Money { return this.cents < 0 ? Money.zero : this; }

  isPositive(): boolean { return this.cents > 0; }
  isZero(): boolean { return this.cents === 0; }
  gt(o: Money): boolean { return this.cents > o.cents; }
  gte(o: Money): boolean { return this.cents >= o.cents; }
  equals(o: Money): boolean { return this.cents === o.cents; }

  static sum(items: readonly Money[]): Money {
    return items.reduce((a, b) => a.plus(b), Money.zero);
  }
}
