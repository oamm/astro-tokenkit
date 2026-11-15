import type { RequestConfig } from '../types';
import { TimeoutError } from '../types';

/** Owns the fetch signal until the entire response is consumed or cancelled. */
export function requestLifetime(request: RequestConfig, timeout: number | false) {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutError = () => new TimeoutError(`Request timeout after ${timeout}ms`, request);
    const cancel = () => controller.abort(request.signal?.reason);
    request.signal?.addEventListener('abort', cancel, { once: true });
    if (request.signal?.aborted) cancel();
    const timer =
        timeout === false
            ? undefined
            : setTimeout(() => {
                  timedOut = true;
                  controller.abort(timeoutError());
              }, timeout);
    return {
        signal: controller.signal,
        abort: (reason?: unknown) => controller.abort(reason),
        finish: () => {
            if (timer !== undefined) clearTimeout(timer);
            request.signal?.removeEventListener('abort', cancel);
        },
        error: (error: unknown): unknown =>
            timedOut ? timeoutError() : request.signal?.aborted ? request.signal.reason : error
    };
}

type RequestLifetime = ReturnType<typeof requestLifetime>;

/** A demand-driven body with bounded buffering and deterministic cleanup on every exit path. */
export function streamingResponse(response: Response, lifetime: RequestLifetime): Response {
    if (!response.body) {
        lifetime.finish();
        return response;
    }
    const reader = response.body.getReader();
    let closed = false;
    let abort: () => void;
    const finish = () => {
        lifetime.finish();
        lifetime.signal.removeEventListener('abort', abort);
    };
    const body = new ReadableStream<Uint8Array>(
        {
            start(output) {
                abort = () => {
                    if (closed) return;
                    closed = true;
                    const reason = lifetime.error(lifetime.signal.reason);
                    finish();
                    output.error(reason);
                    void reader
                        .cancel(reason)
                        .catch(() => {})
                        .finally(() => reader.releaseLock());
                };
                lifetime.signal.addEventListener('abort', abort, { once: true });
                if (lifetime.signal.aborted) abort();
            },
            async pull(output) {
                try {
                    const next = await reader.read();
                    if (closed) return;
                    if (next.done) {
                        closed = true;
                        finish();
                        reader.releaseLock();
                        output.close();
                    } else output.enqueue(next.value);
                } catch (error) {
                    if (closed) return;
                    closed = true;
                    finish();
                    output.error(lifetime.error(error));
                    lifetime.abort(error);
                    reader.releaseLock();
                }
            },
            async cancel(reason) {
                if (closed) return;
                closed = true;
                finish();
                const cancelled = reader.cancel(reason);
                lifetime.abort(reason);
                try {
                    await cancelled;
                } finally {
                    reader.releaseLock();
                }
            }
        },
        { highWaterMark: 0 }
    );
    try {
        const result = new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
        });
        // These read-only fetch metadata fields are not accepted by the Response constructor.
        Object.defineProperties(result, {
            url: { value: response.url },
            redirected: { value: response.redirected },
            type: { value: response.type }
        });
        return result;
    } catch (error) {
        void body.cancel(error).catch(() => {});
        throw error;
    }
}
