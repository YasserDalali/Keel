export class AuthError extends Error {
  constructor(public status: number) {
    super(`auth request failed with ${status}`);
  }
}
