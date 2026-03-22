import type { LoadedAssetInfo } from "../../app/model";

export interface AssetFeatures {
    compressionLabel: string;
    headerLabel: string;
    hasDraco: boolean;
    hasMeshopt: boolean;
    hasGpuInstancing: boolean;
    extensionsUsed: string[];
    extensionsRequired: string[];
}

interface ParsedGltfJson {
    extensionsUsed?: string[];
    extensionsRequired?: string[];
    nodes?: Array<{
        extensions?: Record<string, unknown>;
    }>;
    meshes?: Array<{
        primitives?: Array<{
            extensions?: Record<string, unknown>;
        }>;
    }>;
    bufferViews?: Array<{
        extensions?: Record<string, unknown>;
    }>;
}

function getFileName(file: File): string {
    const extended = file as File & { correctName?: string; webkitRelativePath?: string };
    return extended.correctName || extended.webkitRelativePath || file.name;
}

function getFileExtension(name: string): string {
    const index = name.lastIndexOf(".");
    return index === -1 ? "" : name.slice(index).toLowerCase();
}

function dedupeExtensions(values: Array<string | undefined> | undefined): string[] {
    if (!values?.length) {
        return [];
    }

    return Array.from(new Set(values.filter((value): value is string => Boolean(value)).sort()));
}

function getCompressionLabel(hasDraco: boolean, hasMeshopt: boolean): string {
    if (hasDraco && hasMeshopt) {
        return "Draco + Meshopt";
    }

    if (hasDraco) {
        return "Draco";
    }

    if (hasMeshopt) {
        return "Meshopt";
    }

    return "No Compression";
}

export function detectAssetFeaturesInJson(json: unknown): AssetFeatures {
    const gltf = json as ParsedGltfJson;
    const extensionsUsed = dedupeExtensions(gltf.extensionsUsed);
    const extensionsRequired = dedupeExtensions(gltf.extensionsRequired);

    const hasDraco =
        extensionsUsed.includes("KHR_draco_mesh_compression") ||
        extensionsRequired.includes("KHR_draco_mesh_compression") ||
        Boolean(
            gltf.meshes?.some((mesh) =>
                mesh.primitives?.some((primitive) => Boolean(primitive.extensions?.KHR_draco_mesh_compression))
            )
        );

    const hasMeshopt =
        extensionsUsed.includes("EXT_meshopt_compression") ||
        extensionsRequired.includes("EXT_meshopt_compression") ||
        Boolean(gltf.bufferViews?.some((bufferView) => Boolean(bufferView.extensions?.EXT_meshopt_compression)));

    const hasGpuInstancing =
        extensionsUsed.includes("EXT_mesh_gpu_instancing") ||
        extensionsRequired.includes("EXT_mesh_gpu_instancing") ||
        Boolean(gltf.nodes?.some((node) => Boolean(node.extensions?.EXT_mesh_gpu_instancing)));

    const compressionLabel = getCompressionLabel(hasDraco, hasMeshopt);
    return {
        compressionLabel,
        headerLabel: compressionLabel,
        hasDraco,
        hasMeshopt,
        hasGpuInstancing,
        extensionsUsed,
        extensionsRequired,
    };
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

export async function detectAssetFeaturesFromLoadedAsset(asset: LoadedAssetInfo): Promise<AssetFeatures> {
    const extension = getFileExtension(asset.primaryFileName);
    const sourceFile = asset.files.find((file) => getFileName(file) === asset.primaryFileName) ?? asset.files[0];

    if (extension === ".gltf") {
        return detectAssetFeaturesInJson(JSON.parse(await sourceFile.text()));
    }

    if (extension === ".glb") {
        const json = await readGlbJson(new Uint8Array(await sourceFile.arrayBuffer()));
        return detectAssetFeaturesInJson(json);
    }

    return detectAssetFeaturesInJson({});
}

export async function detectAssetFeaturesFromGlbBytes(glb: Uint8Array): Promise<AssetFeatures> {
    const json = await readGlbJson(glb);
    return detectAssetFeaturesInJson(json);
}
