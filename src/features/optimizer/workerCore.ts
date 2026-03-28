import { ALL_EXTENSIONS, KHRDracoMeshCompression } from "@gltf-transform/extensions";
import { Logger, type JSONDocument, type WebIO } from "@gltf-transform/core";
import type { Document } from "@gltf-transform/core";
import { createStoredZip } from "../../app/zip";
import { detectAssetFeaturesFromGlbBytes } from "../assetFeatures/detectAssetFeatures";
import { prepareGltfOptimization } from "./buildGltfOptimizerTransforms";
import { createGltfOptimizerOptions, type OptimizerWorkerAsset, type OptimizerWorkerJobProgress, type OptimizerWorkerJobRequest, type OptimizerWorkerJobResult, type OptimizerWorkerJobSuccess, type OptimizerWorkerOutputFile } from "./workerShared";

export interface OptimizerWorkerCoreDependencies {
    createIo: (needsDracoEncoder: boolean) => Promise<WebIO>;
    createTextureDocument?: (asset: OptimizerWorkerAsset) => Promise<Document>;
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

function getFileExtension(name: string): string {
    const index = name.lastIndexOf(".");
    return index === -1 ? "" : name.slice(index).toLowerCase();
}

function getTotalAssetSizeBytes(asset: OptimizerWorkerAsset) {
    return asset.files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
}

function getSuggestedOutputFileName(asset: OptimizerWorkerAsset, sceneExportMode: "glb" | "gltf-zip") {
    const baseName = asset.primaryFileName.replace(/\.[^/.]+$/, "") + "-opt";
    return sceneExportMode === "gltf-zip" ? `${baseName}.zip` : `${baseName}.glb`;
}

function getTextureOutputExtension(mimeType: string | null | undefined): string {
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

function getTextureCompressionLabel(mimeType: string | null | undefined): string {
    if (!mimeType) {
        return "Texture";
    }

    return getTextureOutputExtension(mimeType).replace(".", "").toUpperCase();
}

function resolveRelativePath(baseFileName: string, resourceUri: string): string {
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

async function readGltfJsonDocument(asset: OptimizerWorkerAsset): Promise<JSONDocument> {
    const sourceFile = asset.files.find((file) => file.name === asset.primaryFileName) ?? asset.files[0];
    const jsonText = new TextDecoder().decode(sourceFile.bytes);
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
        if (file.name === asset.primaryFileName) {
            continue;
        }

        const normalizedName = normalizePath(file.name);
        const baseName = getBaseName(normalizedName);
        registerResourceAlias(file.name, file.bytes);
        registerResourceAlias(normalizedName, file.bytes);
        registerResourceAlias(baseName, file.bytes);
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

async function readSourceDocument(asset: OptimizerWorkerAsset, io: WebIO) {
    const extension = getFileExtension(asset.primaryFileName);
    if (extension === ".glb") {
        const sourceFile = asset.files.find((file) => file.name === asset.primaryFileName) ?? asset.files[0];
        return {
            document: await io.readBinary(sourceFile.bytes),
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

function createFailureResult(request: OptimizerWorkerJobRequest, error: unknown): OptimizerWorkerJobResult {
    return {
        jobId: request.jobId,
        ok: false,
        assetKind: request.asset.kind,
        inputFileName: request.asset.primaryFileName,
        error: error instanceof Error ? error.message : String(error),
    };
}

function createOutputFile(kind: OptimizerWorkerOutputFile["kind"], fileName: string, mimeType: string, bytes: Uint8Array): OptimizerWorkerOutputFile {
    return {
        kind,
        fileName,
        mimeType,
        bytes,
    };
}

async function createSceneOutputFiles(
    io: WebIO,
    document: Document,
    asset: OptimizerWorkerAsset,
    sceneExportMode: "glb" | "gltf-zip"
): Promise<{ outputFiles: OptimizerWorkerOutputFile[]; primaryOutputFileName: string; sizeBytes: number; compressionLabel: string }> {
    const baseName = asset.primaryFileName.replace(/\.[^/.]+$/, "") + "-opt";
    const previewGlbBytes = await io.writeBinary(document);
    const previewFile = createOutputFile("scene-preview-glb", `${baseName}.glb`, "model/gltf-binary", previewGlbBytes);

    if (sceneExportMode === "gltf-zip") {
        const jsonDocument = await io.writeJSON(document, { basename: baseName });
        const gltfBytes = new TextEncoder().encode(JSON.stringify(jsonDocument.json));
        const zipBytes = createStoredZip([
            { name: `${baseName}.gltf`, data: gltfBytes },
            ...Object.entries(jsonDocument.resources).map(([name, data]) => ({ name, data })),
        ]);

        return {
            outputFiles: [createOutputFile("scene-gltf-zip", `${baseName}.zip`, "application/zip", zipBytes), previewFile],
            primaryOutputFileName: `${baseName}.zip`,
            sizeBytes: zipBytes.byteLength,
            compressionLabel: (await detectAssetFeaturesFromGlbBytes(previewGlbBytes)).compressionLabel,
        };
    }

    return {
        outputFiles: [createOutputFile("scene-glb", `${baseName}.glb`, "model/gltf-binary", previewGlbBytes)],
        primaryOutputFileName: `${baseName}.glb`,
        sizeBytes: previewGlbBytes.byteLength,
        compressionLabel: (await detectAssetFeaturesFromGlbBytes(previewGlbBytes)).compressionLabel,
    };
}

async function createTextureOutputFiles(
    io: WebIO,
    document: Document,
    asset: OptimizerWorkerAsset,
    textureExportMode: "image" | "glb-plane",
    sceneExportMode: "glb" | "gltf-zip"
): Promise<{ outputFiles: OptimizerWorkerOutputFile[]; primaryOutputFileName: string; sizeBytes: number; compressionLabel: string }> {
    if (textureExportMode !== "image") {
        return createSceneOutputFiles(io, document, asset, sceneExportMode);
    }

    const optimizedTexture = document.getRoot().listTextures()[0];
    const image = optimizedTexture?.getImage();
    const mimeType = optimizedTexture?.getMimeType();

    if (!image || !mimeType) {
        throw new Error("Failed to extract the optimized texture image from the generated plane asset.");
    }

    const baseName = asset.primaryFileName.replace(/\.[^/.]+$/, "") + "-opt";
    const previewGlbBytes = await io.writeBinary(document);

    return {
        outputFiles: [
            createOutputFile("texture-image", `${baseName}${getTextureOutputExtension(mimeType)}`, mimeType, image),
            createOutputFile("texture-preview-scene", `${baseName}-preview.glb`, "model/gltf-binary", previewGlbBytes),
        ],
        primaryOutputFileName: `${baseName}${getTextureOutputExtension(mimeType)}`,
        sizeBytes: image.byteLength,
        compressionLabel: getTextureCompressionLabel(mimeType),
    };
}

export async function runOptimizerJob(
    request: OptimizerWorkerJobRequest,
    dependencies: OptimizerWorkerCoreDependencies,
    onProgress?: (progress: OptimizerWorkerJobProgress) => void
): Promise<OptimizerWorkerJobResult> {
    try {
        if (request.settings.textureMode.startsWith("ktx2")) {
            throw new Error("KTX2 texture modes are outside the GLTF-Transform worker-core scope.");
        }

        onProgress?.({
            jobId: request.jobId,
            stage: "reading",
            message: `Loading ${request.asset.primaryFileName}...`,
        });

        const io = await dependencies.createIo(request.settings.draco);
        io.registerExtensions(ALL_EXTENSIONS);

        const document =
            request.asset.kind === "texture"
                ? await dependencies.createTextureDocument?.(request.asset)
                : (await readSourceDocument(request.asset, io)).document;
        if (!document) {
            throw new Error("Texture-only jobs require a createTextureDocument dependency.");
        }
        document.setLogger(new Logger(Logger.Verbosity.INFO));

        const existingDracoExtensions = document
            .getRoot()
            .listExtensionsUsed()
            .filter((extension) => extension.extensionName === KHRDracoMeshCompression.EXTENSION_NAME);

        if (!request.settings.draco) {
            existingDracoExtensions.forEach((extension) => extension.dispose());
        }

        onProgress?.({
            jobId: request.jobId,
            stage: "transforming",
            message: `Applying optimization settings to ${request.asset.primaryFileName}...`,
        });

        const prepared = await prepareGltfOptimization(document, createGltfOptimizerOptions(request.settings));
        await document.transform(...prepared.transforms);

        onProgress?.({
            jobId: request.jobId,
            stage: "writing",
            message:
                request.asset.kind === "texture" && request.settings.textureExportMode === "image"
                    ? `Saving ${request.asset.primaryFileName.replace(/\.[^/.]+$/, "")}-opt...`
                    : `Saving ${getSuggestedOutputFileName(request.asset, request.settings.sceneExportMode)}...`,
        });

        const sceneOutput =
            request.asset.kind === "texture"
                ? await createTextureOutputFiles(
                      io,
                      document,
                      request.asset,
                      request.settings.textureExportMode,
                      request.settings.sceneExportMode
                  )
                : await createSceneOutputFiles(io, document, request.asset, request.settings.sceneExportMode);
        const result: OptimizerWorkerJobSuccess = {
            jobId: request.jobId,
            ok: true,
            assetKind: request.asset.kind,
            inputFileName: request.asset.primaryFileName,
            outputFiles: sceneOutput.outputFiles,
            primaryOutputFileName: sceneOutput.primaryOutputFileName,
            sizeBytes: sceneOutput.sizeBytes,
            compressionLabel: sceneOutput.compressionLabel,
            sourceSizeBytes: getTotalAssetSizeBytes(request.asset),
        };

        onProgress?.({
            jobId: request.jobId,
            stage: "completed",
            message: `${result.primaryOutputFileName} is ready.`,
        });

        return result;
    } catch (error) {
        return createFailureResult(request, error);
    }
}
