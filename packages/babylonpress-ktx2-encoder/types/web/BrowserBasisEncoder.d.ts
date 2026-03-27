import { EncodeInput, IEncodeOptions } from "../type.js";
declare class BrowserBasisEncoder {
    init(options?: {
        jsUrl?: string;
        wasmUrl?: string;
    }): Promise<import("./index.js").IBasisModule>;
    /**
     * encode image data to ktx2 file data
     * @param bufferOrBufferArray - image data, can be a single image or an array of images
     * if it's an array, the images will be encoded as a cube map, the order of the images is:
     *  0: Positive X face
     *  1: Negative X face
     *  2: Positive Y face
     *  3: Negative Y face
     *  4: Positive Z face
     *  5: Negative Z face
     * @param options - encode options, see {@link IEncodeOptions}
     * @returns ktx2 file data
     */
    encode(bufferOrBufferArray: EncodeInput, options?: Partial<IEncodeOptions>): Promise<Uint8Array>;
}
export declare const browserEncoder: BrowserBasisEncoder;
export {};
