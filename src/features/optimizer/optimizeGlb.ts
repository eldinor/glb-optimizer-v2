import { ImageUtils, Logger, WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import type { GltfOptimizerOptions } from "./types";

export interface OptimizeGlbResult {
    glb: Uint8Array;
    sizeBytes: number;
    totalVramBytes: number;
}

export async function optimizeGlb(sourceBytes: Uint8Array, options: GltfOptimizerOptions): Promise<OptimizeGlbResult> {
    const io = new WebIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({
            "meshopt.decoder": MeshoptDecoder,
            "meshopt.encoder": MeshoptEncoder,
        });

    const document = await io.readBinary(sourceBytes);
    document.setLogger(new Logger(Logger.Verbosity.INFO));

    const { prepareGltfOptimization } = await import("./buildGltfOptimizerTransforms");
    const prepared = await prepareGltfOptimization(document, options);
    await document.transform(...prepared.transforms);

    let totalVramBytes = 0;
    for (const texture of document.getRoot().listTextures()) {
        const image = texture.getImage();
        if (!image) {
            continue;
        }
        totalVramBytes += ImageUtils.getVRAMByteLength(image, texture.getMimeType()) ?? 0;
    }

    const glb = await io.writeBinary(document);

    return {
        glb,
        sizeBytes: glb.byteLength || glb.length,
        totalVramBytes,
    };
}
