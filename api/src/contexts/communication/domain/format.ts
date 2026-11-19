const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** "$1,234" for whole amounts, "$1,234.50" otherwise. */
export const usd = (n: number) => (Number.isInteger(n) ? money.format(n).replace(/\.00$/, "") : money.format(n));

/** Short reference people quote for a loan. */
export const ref = (loanId: string) => loanId.slice(0, 8).toUpperCase();
