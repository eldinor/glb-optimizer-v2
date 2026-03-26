import type { LoadedAssetInfo, OptimizationResult, OptimizerSettings } from "./model";
import { detectAssetFeaturesFromGlbBytes } from "../features/assetFeatures/detectAssetFeatures";
import { encodeKtxTextures } from "../features/ktx/encodeKtxTextures";
import type { KtxEncodingOptions } from "../features/ktx/types";
import type { GltfOptimizerOptions } from "../features/optimizer/types";
import { createTexturePlaneDocument } from "../features/texture/texturePlaneAsset";
import { loadDracoDecoderModule, loadDracoEncoderModule } from "../features/draco/loadDracoDecoderModule";
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from "@gltf-transform/extensions";
import { ImageUtils, Logger, WebIO, type JSONDocument } from "@gltf-transform/core";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { createStoredZip } from "./zip";

function getFileExtension(name: string): string {
    const index = name.lastIndexOf(".");
    return index === -1 ? "" : name.slice(index).toLowerCase();
}

function getFileName(file: File): string {
    const extended = file as File & { correctName?: string; webkitRelativePath?: string };
    return extended.correctName || extended.webkitRelativePath || file.name;
}

function normalizePath(value: string): string {
    return value.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+/g, "/");
}

function getDirectoryPath(value: string): string {
    const normalized = normalizePath(value);
    const lastSlashIndex = normalized.lastIndexOf("/");
    return lastSlashIndex === -1 ? "" : normalized.slice(0, lastSlashIndex + 1);
}

function getBaseName(value: string): string {
    const normalized = normalizePath(value);
    const lastSlashIndex = normalized.lastIndexOf("/");
    return lastSlashIndex === -1 ? normalized : normalized.slice(lastSlashIndex + 1);
}

export function resolveRelativePath(baseFileName: string, resourceUri: string): string {
    if (!resourceUri) {
        return resourceUri;
    }

    if (/^[a-z]+:/i.test(resourceUri) || resourceUri.startsWith("/")) {
        return resourceUri;
    }

    const normalizedUri = normalizePath(resourceUri);
    if (!normalizedUri || normalizedUri.startsWith("data:")) {
        return normalizedUri;
    }

    const baseDirectory = getDirectoryPath(baseFileName);
    const joined = `${baseDirectory}${normalizedUri}`;
    const segments: string[] = [];
    for (const segment of joined.split("/")) {
        if (!segment || segment === ".") {
            continue;
        }
        if (segment === "..") {
            segments.pop();
            continue;
        }
        segments.push(segment);
    }

    return segments.join("/");
}

async function createWebIo(needsDracoEncoder: boolean): Promise<WebIO> {
    const dracoDecoderModule = await loadDracoDecoderModule();
    const dracoEncoderModule = needsDracoEncoder ? await loadDracoEncoderModule() : null;

    return new WebIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({
            "draco3d.decoder": dracoDecoderModule,
            ...(dracoEncoderModule ? { "draco3d.encoder": dracoEncoderModule } : {}),
            "meshopt.decoder": MeshoptDecoder,
            "meshopt.encoder": MeshoptEncoder,
        });
}

function getResizeValue(settings: OptimizerSettings): [number, number] | undefined {
    if (settings.resize === "No Resize") {
        return undefined;
    }

    const value = Number(settings.resize);
    return Number.isFinite(value) ? [value, value] : undefined;
}

function isKtxMode(settings: OptimizerSettings): boolean {
    return (
        settings.textureMode === "ktx2-uastc" ||
        settings.textureMode === "ktx2-etc1s" ||
        settings.textureMode === "ktx2-mix" ||
        settings.textureMode === "ktx2-user"
    );
}

function getReusableOptimizerOptions(settings: OptimizerSettings): GltfOptimizerOptions {
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

export function getTextureOutputExtension(mimeType: string | null | undefined): string {
    if (mimeType === "image/webp") {
        return ".webp";
    }

    if (mimeType === "image/png") {
        return ".png";
    }

    if (mimeType === "image/jpeg") {
        return ".jpg";
    }

    if (mimeType === "image/ktx2") {
        return ".ktx2";
    }

    return ".bin";
}

export function getTextureCompressionLabel(mimeType: string | null | undefined): string {
    if (!mimeType) {
        return "Texture";
    }

    return getTextureOutputExtension(mimeType).replace(".", "").toUpperCase();
}

function createDownloadBlobUrl(bytes: Uint8Array, mimeType: string) {
    return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

async function createSceneDownloadOutput(
    io: WebIO,
    document: Awaited<ReturnType<WebIO["readBinary"]>>,
    asset: LoadedAssetInfo,
    settings: OptimizerSettings
) {
    const baseName = asset.primaryFileName.replace(/\.[^/.]+$/, "") + "-opt";
    const previewGlb = await io.writeBinary(document);
    const previewObjectUrl = createDownloadBlobUrl(previewGlb, "model/gltf-binary");

    if (settings.sceneExportMode === "gltf-zip") {
        const jsonDocument = await io.writeJSON(document, { basename: baseName });
        const gltfBytes = new TextEncoder().encode(JSON.stringify(jsonDocument.json));
        const zipBytes = createStoredZip([
            { name: `${baseName}.gltf`, data: gltfBytes },
            ...Object.entries(jsonDocument.resources).map(([name, data]) => ({ name, data })),
        ]);

        return {
            objectUrl: createDownloadBlobUrl(zipBytes, "application/zip"),
            sizeBytes: zipBytes.byteLength || zipBytes.length,
            downloadFileName: `${baseName}.zip`,
            previewObjectUrl,
            previewBytes: previewGlb,
        };
    }

    return {
        objectUrl: previewObjectUrl,
        sizeBytes: previewGlb.byteLength || previewGlb.length,
        downloadFileName: `${baseName}.glb`,
        previewObjectUrl,
        previewBytes: previewGlb,
    };
}

function getKtxEncodingOptions(settings: OptimizerSettings): KtxEncodingOptions {
    return {
        textureMode: settings.textureMode as KtxEncodingOptions["textureMode"],
        qualityLevel: settings.qualityLevel,
        compressionLevel: settings.compressionLevel,
        supercompression: settings.supercompression,
        baseColorUASTC: settings.baseColorUASTC,
        normalUASTC: settings.normalUASTC,
        metallicUASTC: settings.metallicUASTC,
        emissiveUASTC: settings.emissiveUASTC,
        occlusionUASTC: settings.occlusionUASTC,
    };
}

async function readGltfJsonDocument(asset: LoadedAssetInfo): Promise<JSONDocument> {
    const sourceFile = asset.files.find((file) => getFileName(file) === asset.primaryFileName) ?? asset.files[0];
    const jsonText = await sourceFile.text();
    const json = JSON.parse(jsonText) as JSONDocument["json"];
    const resources: Record<string, Uint8Array> = {};
    const fileBytesByName = new Map<string, Uint8Array>();
    const fileBytesByLowerName = new Map<string, Uint8Array>();

    const registerResourceAlias = (key: string, bytes: Uint8Array) => {
        if (!key) {
            return;
        }

        resources[key] = bytes;
        fileBytesByName.set(key, bytes);
        fileBytesByLowerName.set(key.toLowerCase(), bytes);
    };

    for (const file of asset.files) {
        const name = getFileName(file);
        if (name === asset.primaryFileName) {
            continue;
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        const normalizedName = normalizePath(name);
        const baseName = getBaseName(normalizedName);
        registerResourceAlias(name, bytes);
        registerResourceAlias(normalizedName, bytes);
        registerResourceAlias(baseName, bytes);
    }

    const referencedUris = [
        ...(json.buffers ?? []).map((buffer) => buffer.uri),
        ...(json.images ?? []).map((image) => image.uri),
    ].filter((uri): uri is string => Boolean(uri && !uri.startsWith("data:")));

    for (const uri of referencedUris) {
        const resolvedUri = resolveRelativePath(asset.primaryFileName, uri);
        const normalizedUri = normalizePath(uri);
        const resolvedBaseName = getBaseName(resolvedUri);
        const uriBaseName = getBaseName(normalizedUri);
        const bytes =
            fileBytesByName.get(uri) ??
            fileBytesByName.get(normalizedUri) ??
            fileBytesByName.get(resolvedUri) ??
            fileBytesByName.get(normalizePath(resolvedUri)) ??
            fileBytesByName.get(uriBaseName) ??
            fileBytesByName.get(resolvedBaseName) ??
            fileBytesByLowerName.get(uri.toLowerCase()) ??
            fileBytesByLowerName.get(normalizedUri.toLowerCase()) ??
            fileBytesByLowerName.get(resolvedUri.toLowerCase()) ??
            fileBytesByLowerName.get(uriBaseName.toLowerCase()) ??
            fileBytesByLowerName.get(resolvedBaseName.toLowerCase());

        if (!bytes) {
            continue;
        }

        registerResourceAlias(uri, bytes);
        registerResourceAlias(normalizedUri, bytes);
        registerResourceAlias(resolvedUri, bytes);
        registerResourceAlias(normalizePath(resolvedUri), bytes);
        registerResourceAlias(uriBaseName, bytes);
        registerResourceAlias(resolvedBaseName, bytes);
    }

    return { json, resources };
}

async function readSourceDocument(asset: LoadedAssetInfo, io: WebIO) {
    const extension = getFileExtension(asset.primaryFileName);
    if (extension === ".glb") {
        const sourceFile = asset.files.find((file) => getFileName(file) === asset.primaryFileName) ?? asset.files[0];
        const sourceBytes = new Uint8Array(await sourceFile.arrayBuffer());
        return {
            document: await io.readBinary(sourceBytes),
            sourceExtension: extension,
        };
    }

    if (extension === ".gltf") {
        return {
            document: await io.readJSON(await readGltfJsonDocument(asset)),
            sourceExtension: extension,
        };
    }

    throw new Error("Optimization currently supports `.glb` and `.gltf` input only.");
}

export async function optimizeLoadedAsset(asset: LoadedAssetInfo, settings: OptimizerSettings): Promise<OptimizationResult> {
    const io = await createWebIo(settings.draco);
    const { document } = asset.kind === "texture" ? { document: await createTexturePlaneDocument(asset.files[0]) } : await readSourceDocument(asset, io);
    const useKtx = isKtxMode(settings);
    document.setLogger(new Logger(Logger.Verbosity.INFO));
    document.getRoot().getAsset().generator = "GLB Optimizer (https://glb.babylonpress.org)";

    const existingDracoExtensions = document
        .getRoot()
        .listExtensionsUsed()
        .filter((extension) => extension.extensionName === KHRDracoMeshCompression.EXTENSION_NAME);

    if (!settings.draco) {
        existingDracoExtensions.forEach((extension) => extension.dispose());
    }

    const reusableOptions = getReusableOptimizerOptions(settings);
    const { prepareGltfOptimization } = await import("../features/optimizer/buildGltfOptimizerTransforms");

    if (useKtx) {
        const prepared = await prepareGltfOptimization(document, {
            ...reusableOptions,
            texture: {
                resize: reusableOptions.texture.resize,
            },
        });
        await document.transform(...prepared.transforms);
        await encodeKtxTextures(document, getKtxEncodingOptions(settings));
        const optimizedGlb = await io.writeBinary(document);
        const objectUrl = URL.createObjectURL(new Blob([optimizedGlb], { type: "model/gltf-binary" }));

        if (asset.kind === "texture" && settings.textureExportMode === "image") {
            const optimizedTexture = document.getRoot().listTextures()[0];
            const image = optimizedTexture?.getImage();
            const mimeType = optimizedTexture?.getMimeType();
            if (!image || !mimeType) {
                throw new Error("Failed to extract the optimized texture image from the generated plane asset.");
            }

            return {
                kind: "texture",
                objectUrl: URL.createObjectURL(new Blob([image], { type: mimeType })),
                sizeBytes: image.byteLength ?? image.length,
                compressionLabel: getTextureCompressionLabel(mimeType),
                downloadFileName: `${asset.primaryFileName.replace(/\.[^/.]+$/, "")}-opt${getTextureOutputExtension(mimeType)}`,
                previewObjectUrl: objectUrl,
                previewKind: "scene",
            };
        }

        const sceneDownload = await createSceneDownloadOutput(io, document, asset, settings);

        return {
            kind: "scene",
            objectUrl: sceneDownload.objectUrl,
            sizeBytes: sceneDownload.sizeBytes,
            compressionLabel: (await detectAssetFeaturesFromGlbBytes(sceneDownload.previewBytes)).compressionLabel,
            downloadFileName: sceneDownload.downloadFileName,
            previewObjectUrl: sceneDownload.previewObjectUrl,
            previewKind: "scene",
        };
    }

    const prepared = await prepareGltfOptimization(document, reusableOptions);
    await document.transform(...prepared.transforms);

    let totalVramBytes = 0;
    for (const texture of document.getRoot().listTextures()) {
        const image = texture.getImage();
        if (!image) {
            continue;
        }
        totalVramBytes += ImageUtils.getVRAMByteLength(image, texture.getMimeType()) ?? 0;
    }

    if (asset.kind === "texture" && settings.textureExportMode === "image") {
        const optimizedGlb = await io.writeBinary(document);
        const objectUrl = createDownloadBlobUrl(optimizedGlb, "model/gltf-binary");
        const optimizedTexture = document.getRoot().listTextures()[0];
        const image = optimizedTexture?.getImage();
        const mimeType = optimizedTexture?.getMimeType();
        if (!image || !mimeType) {
            throw new Error("Failed to extract the optimized texture image from the generated plane asset.");
        }

        return {
            kind: "texture",
            objectUrl: URL.createObjectURL(new Blob([image], { type: mimeType })),
            sizeBytes: image.byteLength ?? image.length,
            compressionLabel: getTextureCompressionLabel(mimeType),
            downloadFileName: `${asset.primaryFileName.replace(/\.[^/.]+$/, "")}-opt${getTextureOutputExtension(mimeType)}`,
            previewObjectUrl: objectUrl,
            previewKind: "scene",
        };
    }

    const sceneDownload = await createSceneDownloadOutput(io, document, asset, settings);

    return {
        kind: "scene",
        objectUrl: sceneDownload.objectUrl,
        sizeBytes: sceneDownload.sizeBytes || totalVramBytes,
        compressionLabel: (await detectAssetFeaturesFromGlbBytes(sceneDownload.previewBytes)).compressionLabel,
        downloadFileName: sceneDownload.downloadFileName,
        previewObjectUrl: sceneDownload.previewObjectUrl,
        previewKind: "scene",
    };
}
