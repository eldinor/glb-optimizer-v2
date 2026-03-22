export type TextureOutputMode = "keep" | "webp" | "png" | "ktx2-uastc" | "ktx2-etc1s" | "ktx2-mix" | "ktx2-user";

export interface OptimizerSettings {
    resize: "No Resize" | "2048" | "1024" | "512" | "256";
    textureMode: TextureOutputMode;
    draco: boolean;
    dedup: boolean;
    prune: boolean;
    flatten: boolean;
    join: boolean;
    resample: boolean;
    sparse: boolean;
    sparseRatio: number;
    weld: boolean;
    weldTolerance: number;
    weldToleranceNormal: number;
    simplify: boolean;
    simplifyRatio: number;
    simplifyError: number;
    simplifyLockBorder: boolean;
    reorder: boolean;
    quantize: boolean;
    meshopt: boolean;
    meshoptLevel: "high" | "medium";
    gpuInstancing: boolean;
    qualityLevel: number;
    compressionLevel: number;
    supercompression: boolean;
    baseColorUASTC: boolean;
    normalUASTC: boolean;
    metallicUASTC: boolean;
    emissiveUASTC: boolean;
    occlusionUASTC: boolean;
}

export interface AppStatus {
    sourceName: string;
    sourceLabel: string;
    sourceCompression: string;
    optimizedLabel: string;
    optimizedCompression: string;
    message: string;
    warning: string;
}

export interface LoadedAssetInfo {
    primaryFileName: string;
    files: File[];
}

export interface OptimizationResult {
    objectUrl: string;
    sizeBytes: number;
    compressionLabel: string;
}

export interface ScreenshotCompareState {
    mismatchedPixels: number;
    errorPercentage: number;
    diffDataUrl: string;
}
