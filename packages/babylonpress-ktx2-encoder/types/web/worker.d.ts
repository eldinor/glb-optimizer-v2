import type { CubeBufferData, IEncodeOptions, IEncodeWorkerClient } from "../type.js";
export interface KTX2WorkerClient extends IEncodeWorkerClient {
    encode(imageBuffer: Uint8Array | CubeBufferData, options: Omit<IEncodeOptions, "imageDecoder" | "worker">): Promise<Uint8Array>;
    terminate(): void;
    readonly worker: Worker;
}
export interface KTX2WorkerOptions extends WorkerOptions {
    workerUrl?: string | URL;
}
export declare function createKTX2Worker(options?: KTX2WorkerOptions): KTX2WorkerClient;
