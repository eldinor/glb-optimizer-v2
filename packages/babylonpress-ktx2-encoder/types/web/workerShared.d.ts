import type { CubeBufferData, CubeRasterImageData, EncodeInput, IEncodeOptions } from "../type.js";
export type WorkerEncodeInput = EncodeInput;
export interface WorkerEncodeRequest {
    id: number;
    imageBuffer: EncodeInput;
    options: Omit<IEncodeOptions, "imageDecoder" | "worker">;
}
export interface WorkerEncodeSuccess {
    id: number;
    ok: true;
    result: Uint8Array;
}
export interface WorkerEncodeFailure {
    id: number;
    ok: false;
    error: string;
}
export type WorkerEncodeResponse = WorkerEncodeSuccess | WorkerEncodeFailure;
export declare function isCubeBufferData(imageBuffer: WorkerEncodeInput): imageBuffer is CubeBufferData | CubeRasterImageData;
export declare function getTransferList(imageBuffer: WorkerEncodeInput): Transferable[];
