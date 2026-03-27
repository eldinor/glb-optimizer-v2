import { EncodeInput, IEncodeOptions } from "../type.js";
declare class NodeBasisEncoder {
    encode(bufferOrBufferArray: EncodeInput, options?: Partial<IEncodeOptions>): Promise<Buffer<ArrayBuffer>>;
}
export declare const nodeEncoder: NodeBasisEncoder;
export {};
