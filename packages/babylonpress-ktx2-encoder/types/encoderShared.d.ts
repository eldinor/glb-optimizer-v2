import { HDRSourceType } from "./enum.js";
import { CubeBufferData, IBasisEncoder, IEncodeOptions } from "./type.js";
export declare function normalizeError(error: unknown): Error;
export declare function validateEncodeInput(bufferOrBufferArray: Uint8Array | CubeBufferData, options: Partial<IEncodeOptions>, environment: "browser" | "node"): void;
export declare function getHDRSourceType(options: Partial<IEncodeOptions>): HDRSourceType;
export declare function getInitialEncodeBufferSize(bufferOrBufferArray: Uint8Array | CubeBufferData, options: Partial<IEncodeOptions>): number;
export declare function encodeWithGrowingBuffer(encoder: IBasisEncoder, initialSize: number, failureContext: string): Uint8Array;
