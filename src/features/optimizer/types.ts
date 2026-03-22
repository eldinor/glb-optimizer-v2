import type { Transform } from "@gltf-transform/core";

export interface MeshoptOptions {
    enabled: boolean;
    level: "high" | "medium";
}

export interface SimplifyOptions {
    enabled: boolean;
    ratio: number;
    error: number;
    lockBorder: boolean;
}

export interface WeldOptions {
    enabled: boolean;
    tolerance: number;
    toleranceNormal: number;
}

export interface SparseOptions {
    enabled: boolean;
    ratio: number;
}

export interface TextureResizeOptions {
    resize?: [number, number];
}

export interface TextureFormatOptions extends TextureResizeOptions {
    targetFormat?: "webp" | "png";
}

export interface GltfOptimizerOptions {
    draco: boolean;
    dedup: boolean;
    prune: boolean;
    flatten: boolean;
    join: boolean;
    resample: boolean;
    quantize: boolean;
    reorder: boolean;
    gpuInstancing: boolean;
    meshopt: MeshoptOptions;
    simplify: SimplifyOptions;
    weld: WeldOptions;
    sparse: SparseOptions;
    texture: TextureFormatOptions;
}

export interface PreparedGltfOptimization {
    transforms: Transform[];
    requiresMeshGpuInstancingExtension: boolean;
}
