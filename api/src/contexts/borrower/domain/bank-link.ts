import { bankSafetyScore, bankSignals, type AccountBalance } from "./bank-safety";

export type BankLinkState = {
  userId: string;
  /** The provider's id for the connection. */
  itemId: string;
  /** Secret: lets us read balances. Encrypted at rest and never shown to the borrower. */
  accessToken: string;
  institutionName: string | null;
  safetyScore: number;
  signals: string;
};

/** A borrower's connection to their bank: read-only access, plus the safety score we derived from it. One per user; connecting again replaces it. */
export class BankLink {
  private constructor(private state: BankLinkState) {}

  /** Connects from live balances: the score and signals are computed here, not trusted from outside. */
  static connect(p: { userId: string; itemId: string; accessToken: string; institutionName: string | null; accounts: readonly AccountBalance[] }): BankLink {
    return new BankLink({
      userId: p.userId, itemId: p.itemId, accessToken: p.accessToken, institutionName: p.institutionName,
      safetyScore: bankSafetyScore(p.accounts), signals: JSON.stringify(bankSignals(p.accounts)),
    });
  }

  /** Records a connection whose score is already known (stored data, or the demo shortcut). */
  static record(state: BankLinkState): BankLink {
    return new BankLink(state);
  }

  get userId(): string { return this.state.userId; }
  get itemId(): string { return this.state.itemId; }
  get accessToken(): string { return this.state.accessToken; }
  get institutionName(): string | null { return this.state.institutionName; }
  get safetyScore(): number { return this.state.safetyScore; }
  get signals(): string { return this.state.signals; }
}
