/** Time is supplied at the application boundary so rules and retries are deterministic. */
export interface Clock {
  now(): number;
}
