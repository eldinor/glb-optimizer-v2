import { HDRSourceType } from "./enum.js";
import { EncodeInput, IBasisEncoder, IEncodeOptions, IRasterImageData } from "./type.js";
export declare function normalizeError(error: unknown): Error;
export declare function validateEncodeInput(bufferOrBufferArray: EncodeInput, options: Partial<IEncodeOptions>, environment: "browser" | "node"): void;
export declare function isRasterImageData(value: unknown): value is IRasterImageData;
export declare function requiresImageDecoder(input: EncodeInput): boolean;
export declare function getHDRSourceType(options: Partial<IEncodeOptions>): HDRSourceType;
export declare function getInitialEncodeBufferSize(bufferOrBufferArray: EncodeInput, options: Partial<IEncodeOptions>): number;
export declare function encodeWithGrowingBuffer(encoder: IBasisEncoder, initialSize: number, failureContext: string): Uint8Array;
