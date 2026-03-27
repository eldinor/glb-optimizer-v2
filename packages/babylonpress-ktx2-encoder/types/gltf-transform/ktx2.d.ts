import { Transform } from "@gltf-transform/core";
import { IEncodeOptions } from "../type.js";
export type KTX2Options = IEncodeOptions & {
    /** Pattern identifying textures to compress, matched to name or URI */
    pattern?: RegExp | null;
    /** Pattern matching the material texture slots to be compressed */
    slots?: RegExp | null;
};
/**
 * Transforms compatible textures in a glTF asset to KTX2 format.
 * @param options KTX2 compression options
 * @returns Transform
 */
export declare function ktx2(options?: Partial<KTX2Options>): Transform;
