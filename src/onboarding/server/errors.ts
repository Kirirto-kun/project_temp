export class IntakeError extends Error {
  constructor(public status: number, public code: string, message: string, public retryable = false, public currentVersion?: number) {
    super(message);
  }
}
export const conflict = (revision?: number) => new IntakeError(409, 'REVISION_CONFLICT', 'This brief has changed. Refresh and try again.', true, revision);
