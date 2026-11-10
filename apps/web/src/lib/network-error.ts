/**
 * Shared classification of request failures for retry / logout / replay
 * decisions across the web app (axios interceptors, react-query retry policy,
 * the offline outbox UI).
 *
 * A failure is "retryable" when the request never got a definitive answer from
 * the server, or the server reported a transient fault:
 *   - no HTTP response at all  → network down, DNS failure, timeout, CORS, etc.
 *   - 429 Too Many Requests    → back off and try again
 *   - 5xx                      → transient server-side fault
 *
 * Everything else (a real 4xx such as 400/401/403/404) is a definitive
 * rejection: retrying won't change the outcome, so we stop. Techs on patchy
 * West Coast signal hit the "no response" case constantly, and those requests
 * must be kept — never dropped and never treated as a logout.
 *
 * The outbox UI (another module) imports `isRetryableError` from
 * `@/lib/network-error`.
 */
export function isRetryableError(error: unknown): boolean {
    // Read the HTTP status defensively: `error` may be an AxiosError, a plain
    // Error (timeout), null, or anything a mutationFn threw.
    const status =
        typeof error === 'object' && error !== null
            ? (error as { response?: { status?: number } }).response?.status
            : undefined;

    // No numeric status means we never reached the server (network/timeout).
    if (typeof status !== 'number') return true;
    if (status === 429) return true;
    if (status >= 500) return true;
    return false;
}
