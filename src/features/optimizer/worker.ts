import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { type OptimizerWorkerFailureMessage, type OptimizerWorkerRequestMessage, type OptimizerWorkerResponseMessage, getOptimizerWorkerResultTransferList } from "./workerShared";
import { runOptimizerJob } from "./workerCore";
import { createTexturePlaneDocumentFromSource } from "../texture/texturePlaneAsset";
import { loadDracoDecoderModule, loadDracoEncoderModule } from "../draco/loadDracoDecoderModule";

type WorkerScope = typeof globalThis & {
    postMessage: (message: OptimizerWorkerResponseMessage, transfer?: Transferable[]) => void;
};

const workerScope = self as WorkerScope;

workerScope.addEventListener("message", async (event: MessageEvent<OptimizerWorkerRequestMessage>) => {
    const { id, job } = event.data;

    try {
        const result = await runOptimizerJob(
            job,
            {
                createIo: async (needsDracoEncoder) =>
                    new (await import("@gltf-transform/core")).WebIO()
                        .registerExtensions(ALL_EXTENSIONS)
                        .registerDependencies({
                            "draco3d.decoder": await loadDracoDecoderModule(),
                            ...(needsDracoEncoder ? { "draco3d.encoder": await loadDracoEncoderModule() } : {}),
                            "meshopt.decoder": MeshoptDecoder,
                            "meshopt.encoder": MeshoptEncoder,
                        }),
                createTextureDocument: (asset) => {
                    const sourceFile = asset.files.find((file) => file.name === asset.primaryFileName) ?? asset.files[0];
                    if (!sourceFile) {
                        throw new Error(`Texture asset ${asset.primaryFileName} did not include any files.`);
                    }

                    return createTexturePlaneDocumentFromSource(sourceFile);
                },
            },
            (progress) => {
                workerScope.postMessage({
                    id,
                    ok: true,
                    progress,
                });
            }
        );

        if (result.ok) {
            workerScope.postMessage(
                {
                    id,
                    ok: true,
                    result,
                },
                getOptimizerWorkerResultTransferList(result)
            );
            return;
        }

        workerScope.postMessage({
            id,
            ok: false,
            result,
        });
    } catch (error) {
        const failure: OptimizerWorkerFailureMessage = {
            id,
            ok: false,
            result: {
                jobId: job.jobId,
                ok: false,
                assetKind: job.asset.kind,
                inputFileName: job.asset.primaryFileName,
                error: error instanceof Error ? error.message : String(error),
            },
        };
        workerScope.postMessage(failure);
    }
});
