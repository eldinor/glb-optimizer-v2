import { CubeBufferData, IEncodeOptions } from "../type.js";
declare class NodeBasisEncoder {
    encode(bufferOrBufferArray: Uint8Array | CubeBufferData, options?: Partial<IEncodeOptions>): Promise<Buffer<ArrayBuffer>>;
}
export declare const nodeEncoder: NodeBasisEncoder;
export {};
