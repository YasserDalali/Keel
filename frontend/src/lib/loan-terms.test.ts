import { describe, expect, it } from "vitest";
import { quote } from "./loan-terms";

describe("quote", () => {
  it("adds a flat 5% fee and splits it monthly", () => {
    expect(quote(2400, 12)).toEqual({ fee: 120, total: 2520, monthly: 210, upfront: 0 });
  });
  it("rounds the monthly payment to cents like the API", () => {
    expect(quote(1000, 3).monthly).toBe(350);
    expect(quote(1000, 7).monthly).toBe(150);
    expect(quote(1234, 7).monthly).toBe(185.1);
  });
  it("asks 5% upfront only above $5,000", () => {
    expect(quote(5000, 10).upfront).toBe(0);
    expect(quote(6000, 10)).toEqual({ fee: 300, total: 6300, monthly: 630, upfront: 300 });
  });
});
