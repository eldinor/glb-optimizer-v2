import type { OptimizerWorkerJobProgress, OptimizerWorkerJobRequest, OptimizerWorkerJobResult, OptimizerWorkerRequestMessage, OptimizerWorkerResponseMessage } from "./workerShared";
import { getOptimizerWorkerTransferList } from "./workerShared";

export interface OptimizerWorkerClientJobOptions {
    onProgress?: (progress: OptimizerWorkerJobProgress) => void;
    signal?: AbortSignal;
}

export interface OptimizerWorkerClient {
    optimize(job: OptimizerWorkerJobRequest, options?: OptimizerWorkerClientJobOptions): Promise<OptimizerWorkerJobResult>;
    terminate(): void;
    readonly worker: Worker;
}

export interface OptimizerWorkerOptions extends WorkerOptions {
    workerUrl?: string | URL;
}

export interface OptimizerWorkerPoolOptions extends OptimizerWorkerOptions {
    size?: number | "auto";
}

export interface OptimizerWorkerPool {
    readonly size: number;
    readonly workers: readonly Worker[];
    optimize(job: OptimizerWorkerJobRequest, options?: OptimizerWorkerClientJobOptions): Promise<OptimizerWorkerJobResult>;
    optimizeMany(
        jobs: readonly OptimizerWorkerJobRequest[],
        options?: (job: OptimizerWorkerJobRequest) => OptimizerWorkerClientJobOptions | undefined
    ): Promise<OptimizerWorkerJobResult[]>;
    terminate(): void;
}

const DEFAULT_WORKER_URL = new URL("./worker-entry.ts", import.meta.url);
const DEFAULT_POOL_SIZE = 1;
const MAX_AUTO_POOL_SIZE = 2;

function createWorker(workerUrl: string | URL, options: WorkerOptions): Worker {
    return new Worker(workerUrl, { ...options, type: "module" });
}

function resolveAutoPoolSize() {
    const hardwareConcurrency =
        typeof navigator === "object" && typeof navigator.hardwareConcurrency === "number"
            ? navigator.hardwareConcurrency
            : DEFAULT_POOL_SIZE * 2;

    return Math.min(MAX_AUTO_POOL_SIZE, Math.max(DEFAULT_POOL_SIZE, Math.floor(hardwareConcurrency / 2)));
}

function normalizePoolSize(size: number | "auto" | undefined) {
    if (size == null) {
        return DEFAULT_POOL_SIZE;
    }

    if (size === "auto") {
        return resolveAutoPoolSize();
    }

    if (!Number.isInteger(size) || size < 1) {
        throw new Error("Optimizer worker pool size must be an integer greater than or equal to 1.");
    }

    return size;
}

export function createOptimizerWorker(options: OptimizerWorkerOptions = {}): OptimizerWorkerClient {
    let nextRequestId = 0;
    let worker = createWorker(options.workerUrl ?? DEFAULT_WORKER_URL, options);
    const pending = new Map<
        number,
        {
            resolve: (result: OptimizerWorkerJobResult) => void;
            reject: (error: Error) => void;
            onProgress?: (progress: OptimizerWorkerJobProgress) => void;
            cleanupAbort?: () => void;
        }
    >();

    const rejectPending = (error: Error) => {
        for (const request of pending.values()) {
            request.cleanupAbort?.();
            request.reject(error);
        }
        pending.clear();
    };

    const attachWorkerListeners = (target: Worker) => {
        target.addEventListener("message", (event: MessageEvent<OptimizerWorkerResponseMessage>) => {
            const data = event.data;
            if (!data || typeof data.id !== "number" || typeof data.ok !== "boolean") {
                return;
            }

            const request = pending.get(data.id);
            if (!request) {
                return;
            }

            if ("progress" in data) {
                request.onProgress?.(data.progress);
                return;
            }

            pending.delete(data.id);
            request.cleanupAbort?.();
            request.resolve(data.result);
        });

        target.addEventListener("error", (event) => {
            if (target !== worker) {
                return;
            }

            rejectPending(event.error instanceof Error ? event.error : new Error(event.message));
        });

        target.addEventListener("messageerror", () => {
            if (target !== worker) {
                return;
            }

            rejectPending(new Error("Optimizer worker could not deserialize a message."));
        });
    };

    const restartWorker = (error: Error) => {
        const previousWorker = worker;
        worker = createWorker(options.workerUrl ?? DEFAULT_WORKER_URL, options);
        attachWorkerListeners(worker);
        previousWorker.terminate();
        rejectPending(error);
    };

    attachWorkerListeners(worker);

    return {
        get worker() {
            return worker;
        },
        optimize(job, jobOptions = {}) {
            if (jobOptions.signal?.aborted) {
                return Promise.reject(new DOMException("The optimize operation was aborted.", "AbortError"));
            }

            const requestId = nextRequestId++;
            const payload: OptimizerWorkerRequestMessage = {
                id: requestId,
                job,
            };

            return new Promise<OptimizerWorkerJobResult>((resolve, reject) => {
                const abort = () => {
                    if (!pending.has(requestId)) {
                        return;
                    }

                    restartWorker(new DOMException("The optimize operation was aborted.", "AbortError"));
                };

                const cleanupAbort = jobOptions.signal
                    ? () => jobOptions.signal?.removeEventListener("abort", abort)
                    : undefined;

                pending.set(requestId, {
                    resolve,
                    reject,
                    onProgress: jobOptions.onProgress,
                    cleanupAbort,
                });

                if (jobOptions.signal) {
                    jobOptions.signal.addEventListener("abort", abort, { once: true });
                }

                worker.postMessage(payload, getOptimizerWorkerTransferList(job.asset));
            });
        },
        terminate() {
            rejectPending(new Error("Optimizer worker terminated."));
            worker.terminate();
        },
    };
}

interface QueueEntry {
    job: OptimizerWorkerJobRequest;
    options?: OptimizerWorkerClientJobOptions;
    resolve: (result: OptimizerWorkerJobResult) => void;
    reject: (error: Error) => void;
}

interface PoolSlot {
    client: OptimizerWorkerClient;
    busy: boolean;
}

export function createOptimizerWorkerPool(options: OptimizerWorkerPoolOptions = {}): OptimizerWorkerPool {
    const size = normalizePoolSize(options.size);
    const slots: PoolSlot[] = Array.from({ length: size }, () => ({
        client: createOptimizerWorker(options),
        busy: false,
    }));
    const queue: QueueEntry[] = [];
    let terminated = false;

    const rejectQueued = (error: Error) => {
        while (queue.length > 0) {
            const job = queue.shift();
            job?.reject(error);
        }
    };

    const runNext = () => {
        if (terminated || queue.length === 0) {
            return;
        }

        const freeSlot = slots.find((slot) => !slot.busy);
        if (!freeSlot) {
            return;
        }

        const entry = queue.shift();
        if (!entry) {
            return;
        }

        freeSlot.busy = true;
        void freeSlot.client
            .optimize(entry.job, entry.options)
            .then(entry.resolve, entry.reject)
            .finally(() => {
                freeSlot.busy = false;
                runNext();
            });
    };

    return {
        size,
        workers: slots.map((slot) => slot.client.worker),
        optimize(job, jobOptions) {
            if (terminated) {
                return Promise.reject(new Error("Optimizer worker pool terminated."));
            }

            return new Promise<OptimizerWorkerJobResult>((resolve, reject) => {
                jobOptions?.onProgress?.({
                    jobId: job.jobId,
                    stage: "queued",
                    message: `Preparing ${job.asset.primaryFileName} for optimization...`,
                });
                queue.push({
                    job,
                    options: jobOptions,
                    resolve,
                    reject,
                });
                runNext();
            });
        },
        optimizeMany(jobs, jobOptionsFactory) {
            return Promise.all(jobs.map((job) => this.optimize(job, jobOptionsFactory?.(job))));
        },
        terminate() {
            if (terminated) {
                return;
            }

            terminated = true;
            rejectQueued(new Error("Optimizer worker pool terminated."));
            for (const slot of slots) {
                slot.client.terminate();
            }
        },
    };
}
