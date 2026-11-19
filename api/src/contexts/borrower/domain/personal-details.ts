import { DetailsIncomplete } from "./errors";

/** What a borrower tells us about themselves. Sensitive: the repository encrypts every field at rest. */
export class PersonalDetails {
  private constructor(
    readonly firstName: string,
    readonly lastName: string,
    readonly phone: string,
    readonly address: string,
    readonly nationalIdNumber: string,
  ) {}

  /** All five fields are required. */
  static of(p: { firstName?: string; lastName?: string; phone?: string; address?: string; nationalIdNumber?: string }): PersonalDetails {
    const { firstName, lastName, phone, address, nationalIdNumber } = p;
    if (!firstName || !lastName || !phone || !address || !nationalIdNumber) throw new DetailsIncomplete();
    return new PersonalDetails(firstName, lastName, phone, address, nationalIdNumber);
  }

  /** Rebuilds from storage, where older rows can have gaps (a profile started by an ID check has no details yet). */
  static restore(p: { firstName: string | null; lastName: string | null; phone: string | null; address: string | null; nationalIdNumber: string | null }) {
    return {
      firstName: p.firstName, lastName: p.lastName, phone: p.phone, address: p.address, nationalIdNumber: p.nationalIdNumber,
    };
  }
}
export type StoredDetails = ReturnType<typeof PersonalDetails.restore>;
