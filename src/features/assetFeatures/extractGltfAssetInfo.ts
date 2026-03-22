import type { LoadedAssetInfo } from "../../app/model";

export interface GltfAssetInfo {
    container: "GLB" | "glTF";
    version: string;
    generator: string;
    copyright: string;
    author: string;
    sceneCount: number;
    defaultSceneIndex: number | null;
    nodeCount: number;
    meshCount: number;
    primitiveCount: number;
    materialCount: number;
    textureCount: number;
    imageCount: number;
    animationCount: number;
    skinCount: number;
    cameraCount: number;
    lightCount: number;
    extensionsUsed: string[];
    extensionsRequired: string[];
    rootExtrasSummary: string;
    assetExtrasSummary: string;
}

interface ParsedGltfJson {
    asset?: {
        version?: string;
        generator?: string;
        copyright?: string;
        extras?: unknown;
    };
    extras?: unknown;
    scene?: number;
    scenes?: unknown[];
    nodes?: unknown[];
    meshes?: Array<{
        primitives?: unknown[];
    }>;
    materials?: unknown[];
    textures?: unknown[];
    images?: unknown[];
    animations?: unknown[];
    skins?: unknown[];
    cameras?: unknown[];
    extensionsUsed?: string[];
    extensionsRequired?: string[];
    extensions?: {
        KHR_lights_punctual?: {
            lights?: unknown[];
        };
    };
}

function readNamedString(record: unknown, keys: string[]): string {
    if (!record || typeof record !== "object") {
        return "";
    }

    for (const key of keys) {
        const value = (record as Record<string, unknown>)[key];
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }

    return "";
}

function summarizeExtras(extras: unknown): string {
    if (extras === undefined) {
        return "";
    }

    if (extras === null) {
        return "null";
    }

    if (typeof extras === "string") {
        return extras || "string";
    }

    if (typeof extras === "number" || typeof extras === "boolean") {
        return String(extras);
    }

    if (Array.isArray(extras)) {
        return `array(${extras.length})`;
    }

    if (typeof extras === "object") {
        const keys = Object.keys(extras);
        return keys.length ? keys.join(", ") : "object";
    }

    return "";
}

function getFileName(file: File): string {
    const extended = file as File & { correctName?: string; webkitRelativePath?: string };
    return extended.correctName || extended.webkitRelativePath || file.name;
}

function getFileExtension(name: string): string {
    const index = name.lastIndexOf(".");
    return index === -1 ? "" : name.slice(index).toLowerCase();
}

function dedupeExtensions(values: string[] | undefined): string[] {
    if (!values?.length) {
        return [];
    }

    return Array.from(new Set(values)).sort();
}

async function readGlbJson(sourceBytes: Uint8Array): Promise<unknown> {
    if (sourceBytes.byteLength < 20) {
        return null;
    }

    const header = new Uint32Array(sourceBytes.buffer, sourceBytes.byteOffset, 3);
    if (header[0] !== 0x46546c67 || header[1] !== 2) {
        return null;
    }

    const jsonChunkHeader = new Uint32Array(sourceBytes.buffer, sourceBytes.byteOffset + 12, 2);
    if (jsonChunkHeader[1] !== 0x4e4f534a) {
        return null;
    }

    const jsonByteOffset = sourceBytes.byteOffset + 20;
    const jsonByteLength = jsonChunkHeader[0];
    const jsonText = new TextDecoder().decode(new Uint8Array(sourceBytes.buffer, jsonByteOffset, jsonByteLength));
    return JSON.parse(jsonText);
}

function toGltfAssetInfo(container: "GLB" | "glTF", json: unknown): GltfAssetInfo {
    const gltf = (json ?? {}) as ParsedGltfJson;
    const author =
        readNamedString(gltf.asset?.extras, ["author", "Author", "creator", "Creator", "artist", "Artist"]) ||
        readNamedString(gltf.extras, ["author", "Author", "creator", "Creator", "artist", "Artist"]);

    return {
        container,
        version: gltf.asset?.version ?? "Unknown",
        generator: gltf.asset?.generator ?? "Unknown",
        copyright: gltf.asset?.copyright ?? "",
        author,
        sceneCount: gltf.scenes?.length ?? 0,
        defaultSceneIndex: typeof gltf.scene === "number" ? gltf.scene : null,
        nodeCount: gltf.nodes?.length ?? 0,
        meshCount: gltf.meshes?.length ?? 0,
        primitiveCount: gltf.meshes?.reduce((sum, mesh) => sum + (mesh.primitives?.length ?? 0), 0) ?? 0,
        materialCount: gltf.materials?.length ?? 0,
        textureCount: gltf.textures?.length ?? 0,
        imageCount: gltf.images?.length ?? 0,
        animationCount: gltf.animations?.length ?? 0,
        skinCount: gltf.skins?.length ?? 0,
        cameraCount: gltf.cameras?.length ?? 0,
        lightCount: gltf.extensions?.KHR_lights_punctual?.lights?.length ?? 0,
        extensionsUsed: dedupeExtensions(gltf.extensionsUsed),
        extensionsRequired: dedupeExtensions(gltf.extensionsRequired),
        rootExtrasSummary: summarizeExtras(gltf.extras),
        assetExtrasSummary: summarizeExtras(gltf.asset?.extras),
    };
}

export async function extractGltfAssetInfoFromLoadedAsset(asset: LoadedAssetInfo): Promise<GltfAssetInfo | null> {
    if (asset.kind !== "scene") {
        return null;
    }

    const extension = getFileExtension(asset.primaryFileName);
    const sourceFile = asset.files.find((file) => getFileName(file) === asset.primaryFileName) ?? asset.files[0];

    if (extension === ".gltf") {
        return toGltfAssetInfo("glTF", JSON.parse(await sourceFile.text()));
    }

    if (extension === ".glb") {
        const json = await readGlbJson(new Uint8Array(await sourceFile.arrayBuffer()));
        return toGltfAssetInfo("GLB", json);
    }

    return null;
}
