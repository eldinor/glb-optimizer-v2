import { EncodeInput, IEncodeOptions } from "../type.js";
export { createKTX2Worker } from "./worker.js";
export { createKTX2WorkerPool } from "./workerPool.js";
export * from "../enum.js";
export * from "../type.js";
export declare function encodeToKTX2(imageBuffer: EncodeInput, options: IEncodeOptions): Promise<Uint8Array>;
