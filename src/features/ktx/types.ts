export type KtxTextureMode = "ktx2-uastc" | "ktx2-etc1s" | "ktx2-mix" | "ktx2-user";

export interface KtxEncodingOptions {
    textureMode: KtxTextureMode;
    qualityLevel: number;
    compressionLevel: number;
    supercompression: boolean;
    baseColorUASTC: boolean;
    normalUASTC: boolean;
    metallicUASTC: boolean;
    emissiveUASTC: boolean;
    occlusionUASTC: boolean;
}
