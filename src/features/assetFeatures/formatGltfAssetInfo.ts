import type { GltfAssetInfo } from "./extractGltfAssetInfo";

export interface GltfAssetInfoRow {
    label?: string;
    items: string[];
    variant: "default" | "extensions";
}

function pushRow(
    rows: GltfAssetInfoRow[],
    label: string | undefined,
    items: Array<string | null | undefined>,
    variant: GltfAssetInfoRow["variant"] = "default"
) {
    const filteredItems = items.filter((item): item is string => Boolean(item && item.trim()));
    if (!filteredItems.length) {
        return;
    }

    rows.push({
        label,
        items: filteredItems,
        variant,
    });
}

export function formatGltfAssetInfoRows(info: GltfAssetInfo): GltfAssetInfoRow[] {
    const rows: GltfAssetInfoRow[] = [];

    pushRow(rows, "Asset Metadata", [`Container: ${info.container}`, `Version: glTF ${info.version}`, `Generator: ${info.generator}`]);
    pushRow(rows, undefined, [info.author ? `Author: ${info.author}` : null, info.copyright ? `Copyright: ${info.copyright}` : null]);
    pushRow(rows, "Scene Stats", [`Scenes: ${info.sceneCount}`, `Nodes: ${info.nodeCount}`, `Meshes: ${info.meshCount}`, `Primitives: ${info.primitiveCount}`]);
    pushRow(rows, "Resources", [`Materials: ${info.materialCount}`, `Textures: ${info.textureCount}`, `Images: ${info.imageCount}`, `Animations: ${info.animationCount}`]);
    pushRow(rows, "Runtime", [`Skins: ${info.skinCount}`, `Cameras: ${info.cameraCount}`, `Lights: ${info.lightCount}`, `Default scene: ${info.defaultSceneIndex === null ? "n/a" : info.defaultSceneIndex}`]);
    pushRow(rows, "Extensions", [info.extensionsUsed.length ? `Used: ${info.extensionsUsed.join(", ")}` : null], "extensions");
    pushRow(rows, undefined, [info.extensionsRequired.length ? `Required: ${info.extensionsRequired.join(", ")}` : null], "extensions");
    pushRow(
        rows,
        "Extras",
        [
            info.rootExtrasSummary ? `Extras: ${info.rootExtrasSummary}` : null,
            info.assetExtrasSummary ? `Asset extras: ${info.assetExtrasSummary}` : null,
        ],
        "extensions"
    );

    return rows;
}
