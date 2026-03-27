import type { EncodeInput, IEncodeOptions, IEncodeWorkerClient } from "../type.js";
import { type KTX2WorkerOptions } from "./worker.js";
export interface KTX2WorkerPoolOptions extends KTX2WorkerOptions {
    size?: number | "auto";
}
export interface KTX2WorkerPoolJob {
    imageBuffer: EncodeInput;
    options: Omit<IEncodeOptions, "imageDecoder" | "worker">;
}
export interface KTX2WorkerPool extends IEncodeWorkerClient {
    readonly size: number;
    readonly workers: readonly Worker[];
    encode(imageBuffer: EncodeInput, options: Omit<IEncodeOptions, "imageDecoder" | "worker">): Promise<Uint8Array>;
    encodeMany(jobs: readonly KTX2WorkerPoolJob[]): Promise<Uint8Array[]>;
    terminate(): void;
}
export declare function createKTX2WorkerPool(options?: KTX2WorkerPoolOptions): KTX2WorkerPool;
