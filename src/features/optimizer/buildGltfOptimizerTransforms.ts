import { EXTMeshGPUInstancing } from "@gltf-transform/extensions";
import {
    dedup,
    draco,
    flatten,
    instance,
    join,
    meshopt,
    prune,
    quantize,
    reorder,
    resample,
    simplify,
    sparse,
    textureCompress,
    weld,
    type TextureCompressOptions,
} from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import type { Document } from "@gltf-transform/core";
import type { GltfOptimizerOptions, PreparedGltfOptimization } from "./types";

export async function prepareGltfOptimization(document: Document, options: GltfOptimizerOptions): Promise<PreparedGltfOptimization> {
    const transforms = [];
    await MeshoptEncoder.ready;

    if (options.dedup) {
        transforms.push(dedup());
    }

    if (options.gpuInstancing) {
        transforms.push(instance({ min: 2 }));
    }

    if (options.prune) {
        transforms.push(prune());
    }

    if (options.flatten) {
        transforms.push(flatten());
    }

    if (options.join) {
        transforms.push(join({ keepMeshes: false, keepNamed: false }));
    }

    if (options.resample) {
        transforms.push(resample());
    }

    if (options.weld.enabled) {
        transforms.push(weld());
    }

    if (options.simplify.enabled) {
        transforms.push(
            simplify({
                simplifier: MeshoptSimplifier,
                ratio: options.simplify.ratio,
                error: options.simplify.error,
                lockBorder: options.simplify.lockBorder,
            })
        );
    }

    if (options.reorder) {
        transforms.push(reorder({ encoder: MeshoptEncoder }));
    }

    if (options.quantize) {
        transforms.push(quantize());
    }

    if (options.meshopt.enabled) {
        transforms.push(
            meshopt({
                encoder: MeshoptEncoder,
                level: options.meshopt.level,
            })
        );
    }

    if (options.sparse.enabled) {
        transforms.push(
            sparse({
                ratio: options.sparse.ratio,
            })
        );
    }

    if (options.texture.targetFormat || options.texture.resize) {
        transforms.push(textureCompress(options.texture as TextureCompressOptions));
    }

    if (options.draco) {
        transforms.push(draco());
    }

    if (options.gpuInstancing) {
        document.createExtension(EXTMeshGPUInstancing).setRequired(true);
    }

    return {
        transforms,
        requiresMeshGpuInstancingExtension: options.gpuInstancing,
    };
}
