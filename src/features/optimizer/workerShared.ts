import type { LoadedAssetKind, OptimizerSettings } from "../../app/model";
import type { GltfOptimizerOptions } from "./types";

export type OptimizerJobPriority = "interactive" | "batch";
export type OptimizerJobStage = "queued" | "reading" | "transforming" | "writing" | "completed";
export type OptimizerOutputKind = "scene-glb" | "scene-gltf-zip" | "scene-preview-glb" | "texture-image" | "texture-preview-scene";

export interface OptimizerWorkerFile {
    name: string;
    type: string;
    bytes: Uint8Array;
}

export interface OptimizerWorkerAsset {
    kind: LoadedAssetKind;
    primaryFileName: string;
    files: OptimizerWorkerFile[];
}

export interface OptimizerWorkerOutputFile {
    kind: OptimizerOutputKind;
    fileName: string;
    mimeType: string;
    bytes: Uint8Array;
}

export interface OptimizerWorkerJobRequest {
    jobId: string;
    priority: OptimizerJobPriority;
    asset: OptimizerWorkerAsset;
    settings: OptimizerSettings;
}

export interface OptimizerWorkerJobProgress {
    jobId: string;
    stage: OptimizerJobStage;
    message: string;
}

export interface OptimizerWorkerJobSuccess {
    jobId: string;
    ok: true;
    assetKind: LoadedAssetKind;
    inputFileName: string;
    outputFiles: OptimizerWorkerOutputFile[];
    primaryOutputFileName: string;
    sizeBytes: number;
    compressionLabel: string;
    sourceSizeBytes: number;
}

export interface OptimizerWorkerJobFailure {
    jobId: string;
    ok: false;
    assetKind: LoadedAssetKind;
    inputFileName: string;
    error: string;
}

export type OptimizerWorkerJobResult = OptimizerWorkerJobSuccess | OptimizerWorkerJobFailure;

export interface OptimizerWorkerRequestMessage {
    id: number;
    job: OptimizerWorkerJobRequest;
}

export interface OptimizerWorkerSuccessMessage {
    id: number;
    ok: true;
    result: OptimizerWorkerJobSuccess;
}

export interface OptimizerWorkerFailureMessage {
    id: number;
    ok: false;
    result: OptimizerWorkerJobFailure;
}

export interface OptimizerWorkerProgressMessage {
    id: number;
    ok: true;
    progress: OptimizerWorkerJobProgress;
}

export type OptimizerWorkerResponseMessage =
    | OptimizerWorkerSuccessMessage
    | OptimizerWorkerFailureMessage
    | OptimizerWorkerProgressMessage;

export interface OptimizerBatchManifestEntry {
    jobId: string;
    inputFileName: string;
    assetKind: LoadedAssetKind;
    ok: boolean;
    primaryOutputFileName?: string;
    compressionLabel?: string;
    sourceSizeBytes?: number;
    sizeBytes?: number;
    error?: string;
}

export interface OptimizerBatchManifest {
    createdAt: string;
    settings: OptimizerSettings;
    entries: OptimizerBatchManifestEntry[];
}

function getResizeValue(settings: OptimizerSettings): [number, number] | undefined {
    if (settings.resize === "No Resize") {
        return undefined;
    }

    const value = Number(settings.resize);
    return Number.isFinite(value) ? [value, value] : undefined;
}

export function createGltfOptimizerOptions(settings: OptimizerSettings): GltfOptimizerOptions {
    const resize = getResizeValue(settings);
    const targetFormat = settings.textureMode === "webp" || settings.textureMode === "png" ? settings.textureMode : undefined;

    return {
        draco: settings.draco,
        dedup: settings.dedup,
        prune: settings.prune,
        flatten: settings.flatten,
        join: settings.join,
        resample: settings.resample,
        quantize: settings.quantize,
        reorder: settings.reorder,
        gpuInstancing: settings.gpuInstancing,
        meshopt: {
            enabled: settings.meshopt,
            level: settings.meshoptLevel,
        },
        simplify: {
            enabled: settings.simplify,
            ratio: settings.simplifyRatio,
            error: settings.simplifyError,
            lockBorder: settings.simplifyLockBorder,
        },
        weld: {
            enabled: settings.weld,
            tolerance: settings.weldTolerance,
            toleranceNormal: settings.weldToleranceNormal,
        },
        sparse: {
            enabled: settings.sparse,
            ratio: settings.sparseRatio,
        },
        texture: {
            targetFormat,
            resize,
        },
    };
}

export function getOptimizerWorkerTransferList(asset: OptimizerWorkerAsset): Transferable[] {
    return asset.files.map((file) => file.bytes.buffer);
}

export function getOptimizerWorkerResultTransferList(result: OptimizerWorkerJobSuccess): Transferable[] {
    return result.outputFiles.map((file) => file.bytes.buffer);
}

export function createBatchManifest(
    settings: OptimizerSettings,
    results: readonly OptimizerWorkerJobResult[],
    createdAt = new Date().toISOString()
): OptimizerBatchManifest {
    return {
        createdAt,
        settings,
        entries: results.map((result) =>
            result.ok
                ? {
                      jobId: result.jobId,
                      inputFileName: result.inputFileName,
                      assetKind: result.assetKind,
                      ok: true,
                      primaryOutputFileName: result.primaryOutputFileName,
                      compressionLabel: result.compressionLabel,
                      sourceSizeBytes: result.sourceSizeBytes,
                      sizeBytes: result.sizeBytes,
                  }
                : {
                      jobId: result.jobId,
                      inputFileName: result.inputFileName,
                      assetKind: result.assetKind,
                      ok: false,
                      error: result.error,
                  }
        ),
    };
}
