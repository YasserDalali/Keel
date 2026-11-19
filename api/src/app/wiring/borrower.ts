import {
  ApplyVerificationWebhook, ApproveIdentity, CompleteBankLink, ConnectBank, CreateBankLinkToken, GetBorrowerStanding, GetOwnProfile, GetProfileForStaff,
  RefreshIdentityVerification, SaveProfileDetails, StartIdentityVerification,
} from "../../contexts/borrower/application/use-cases";
import { D1BankLinkRepository } from "../../contexts/borrower/infrastructure/d1-bank-link-repository";
import { D1ProfileRepository } from "../../contexts/borrower/infrastructure/d1-profile-repository";
import { diditProvider, kvDeduplicator, plaidProvider } from "../../contexts/borrower/infrastructure/providers";
import type { Wiring } from "./shared";

export function wireBorrower({ env, clock }: Wiring) {
  const profiles = new D1ProfileRepository(env.DB, env.PII_ENCRYPTION_KEY);
  const banks = new D1BankLinkRepository(env.DB, env.PII_ENCRYPTION_KEY);
  const didit = diditProvider(env);
  const plaid = plaidProvider(env);

  return {
    ownProfile: new GetOwnProfile(profiles, banks),
    profileForStaff: new GetProfileForStaff(profiles),
    saveDetails: new SaveProfileDetails(profiles),
    startVerification: new StartIdentityVerification(profiles, didit, clock),
    refreshVerification: new RefreshIdentityVerification(profiles, didit, clock),
    verificationWebhook: new ApplyVerificationWebhook(profiles, didit, kvDeduplicator(env.LOAN_CACHE), clock),
    createBankLinkToken: new CreateBankLinkToken(plaid),
    connectBank: new ConnectBank(banks, plaid),
    standing: new GetBorrowerStanding(profiles, banks),
    // demo shortcuts, called by the demo adapter only
    completeBankLink: new CompleteBankLink(banks),
    approveIdentity: new ApproveIdentity(profiles, clock),
  };
}
export type BorrowerServices = ReturnType<typeof wireBorrower>;
