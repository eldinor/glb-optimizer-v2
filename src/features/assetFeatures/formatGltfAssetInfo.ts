import type { GltfAssetInfo } from "./extractGltfAssetInfo";

export interface GltfAssetInfoRow {
    section?: string;
    label?: string;
    items: string[];
    variant: "default" | "extensions";
}

function pushRow(
    rows: GltfAssetInfoRow[],
    section: string | undefined,
    label: string | undefined,
    items: Array<string | null | undefined>,
    variant: GltfAssetInfoRow["variant"] = "default"
) {
    const filteredItems = items.filter((item): item is string => Boolean(item && item.trim()));
    if (!filteredItems.length) {
        return;
    }

    rows.push({
        section,
        label,
        items: filteredItems,
        variant,
    });
}

export function formatGltfAssetInfoRows(info: GltfAssetInfo): GltfAssetInfoRow[] {
    const rows: GltfAssetInfoRow[] = [];

    // pushRow(rows, "Asset Metadata", "Container", [info.container]);
    // pushRow(rows, undefined, "Version", [`glTF ${info.version}`]);
    pushRow(rows, undefined, "Generator", [info.generator]);
    pushRow(rows, undefined, "Author", [info.author ? info.author : null]);
    pushRow(rows, undefined, "Copyright", [info.copyright ? info.copyright : null]);
    pushRow(rows, "Scene Stats", "Scenes", [`${info.sceneCount}`]);
    pushRow(rows, undefined, "Nodes", [`${info.nodeCount}`]);
    pushRow(rows, undefined, "Meshes", [`${info.meshCount}`]);
    pushRow(rows, undefined, "Primitives", [`${info.primitiveCount}`]);
    pushRow(rows, undefined, "Materials", [`${info.materialCount}`]);
    pushRow(rows, undefined, "Textures", [`${info.textureCount}`]);
    pushRow(rows, undefined, "Images", [`${info.imageCount}`]);
    pushRow(rows, undefined, "Animations", [`${info.animationCount}`]);
    pushRow(rows, undefined, "Skins", [`${info.skinCount}`]);
    pushRow(rows, undefined, "Cameras", [`${info.cameraCount}`]);
    pushRow(rows, undefined, "Lights", [`${info.lightCount}`]);
    pushRow(rows, "Extensions", "Used", info.extensionsUsed, "extensions");
    pushRow(rows, undefined, "Required", info.extensionsRequired, "extensions");

    return rows;
}
