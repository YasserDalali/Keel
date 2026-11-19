import { InvalidEmail } from "./errors";

/** An email address as the system compares it: lower case, so "A@x.com" and "a@x.com" are the same person. */
export class Email {
  private constructor(readonly value: string) {}

  static of(raw: unknown): Email {
    if (typeof raw !== "string" || raw.length === 0) throw new InvalidEmail();
    return new Email(raw.toLowerCase());
  }
}
