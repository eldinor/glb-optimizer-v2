import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { AssetFeatures } from "../features/assetFeatures/detectAssetFeatures";
import { detectAssetFeaturesFromLoadedAsset } from "../features/assetFeatures/detectAssetFeatures";
import { extractGltfAssetInfoFromLoadedAsset, type GltfAssetInfo } from "../features/assetFeatures/extractGltfAssetInfo";
import type { AnimationControlsState } from "../components/AnimationControls.types";
import type { ViewerCanvasHandle, ViewerSceneInfo } from "../components/ViewerCanvas";
import { optimizeLoadedAsset } from "./optimizer";
import type { AppStatus, LoadedAssetInfo, LoadedAssetKind, OptimizerSettings, ScreenshotCompareState } from "./model";

export type CompressionPreference = "uncompress" | "keep-same";

export interface OptimizedAssetState {
    url: string;
    kind: LoadedAssetKind;
    downloadFileName: string;
    previewUrl: string;
    previewKind: LoadedAssetKind;
}

export const INITIAL_STATUS: AppStatus = {
    sourceName: "Awaiting file import",
    sourceLabel: "Awaiting file import",
    sourceCompression: "No Compression",
    optimizedLabel: "Converted Size",
    optimizedCompression: "No Compression",
    message: "Open a scene or supported texture, or drop files onto the render area.",
    warning: "",
};

function formatMegabytes(sizeBytes: number) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getOptimizationSignature(settings: unknown, compressionPreference: CompressionPreference) {
    return JSON.stringify({
        settings,
        compressionPreference,
    });
}

function getTextureExportLabel(exportMode: "image" | "glb-plane") {
    return exportMode === "image" ? "image" : "GLB plane";
}

function getSceneExportLabel(exportMode: OptimizerSettings["sceneExportMode"]) {
    return exportMode === "gltf-zip" ? "zipped GLTF" : "GLB";
}

export function getExpectedDownloadFileName(
    asset: { kind: LoadedAssetKind; primaryFileName: string },
    settings: OptimizerSettings
) {
    const baseName = asset.primaryFileName.replace(/\.[^/.]+$/, "");
    if (asset.kind === "texture" && settings.textureExportMode === "image") {
        const extension =
            settings.textureMode === "png"
                ? ".png"
                : settings.textureMode === "webp"
                  ? ".webp"
                  : settings.textureMode === "keep"
                    ? asset.primaryFileName.slice(asset.primaryFileName.lastIndexOf(".")) || ".bin"
                    : ".ktx2";
        return `${baseName}-opt${extension}`;
    }

    return settings.sceneExportMode === "gltf-zip" ? `${baseName}-opt.zip` : `${baseName}-opt.glb`;
}

export function getCompressionConflictWarning(
    settings: OptimizerSettings,
    compressionPreference: CompressionPreference,
    sourceAssetFeatures: AssetFeatures | null,
    activeAssetKind: LoadedAssetKind | null
) {
    if (compressionPreference !== "keep-same" || activeAssetKind !== "scene" || !sourceAssetFeatures) {
        return "";
    }

    const userSelectedDraco = settings.draco;
    const userSelectedMeshopt = settings.meshopt;
    const sourceHasDraco = sourceAssetFeatures.hasDraco;
    const sourceHasMeshopt = sourceAssetFeatures.hasMeshopt;
    const effectiveDraco = settings.draco || (!settings.meshopt && sourceAssetFeatures.hasDraco);
    const effectiveMeshopt = settings.meshopt || (!settings.draco && sourceAssetFeatures.hasMeshopt);

    if ((userSelectedDraco && sourceHasMeshopt && !sourceHasDraco) || (userSelectedMeshopt && sourceHasDraco && !sourceHasMeshopt)) {
        return "Warning: the source file uses a different compression method. Your chosen compression setting is being used instead of preserving the original compression.";
    }

    if (!effectiveDraco || !effectiveMeshopt) {
        return "";
    }

    if (userSelectedDraco || userSelectedMeshopt) {
        return "Warning: the source file uses a different compression method. Your chosen compression setting is being used instead of preserving the original compression.";
    }

    return "Warning: both Draco and Meshopt compression are active for this asset.";
}

function getEffectiveOptimizationSettings(
    settings: OptimizerSettings,
    compressionPreference: CompressionPreference,
    sourceAssetFeatures: AssetFeatures | null,
    activeAssetKind: LoadedAssetKind | null
) {
    if (compressionPreference !== "keep-same" || activeAssetKind !== "scene" || !sourceAssetFeatures) {
        return settings;
    }

    if (settings.draco || settings.meshopt) {
        return settings;
    }

    return {
        ...settings,
        draco: sourceAssetFeatures.hasDraco,
        meshopt: sourceAssetFeatures.hasMeshopt,
    };
}

interface UseOptimizationControllerArgs {
    settings: OptimizerSettings;
    compressionPreference: CompressionPreference;
    viewerRef: RefObject<ViewerCanvasHandle | null>;
    emptyAnimationState: AnimationControlsState;
    setAnimationState: Dispatch<SetStateAction<AnimationControlsState>>;
}

export function useOptimizationController({
    settings,
    compressionPreference,
    viewerRef,
    emptyAnimationState,
    setAnimationState,
}: UseOptimizationControllerArgs) {
    const [status, setStatus] = useState<AppStatus>(INITIAL_STATUS);
    const [optimizedAsset, setOptimizedAsset] = useState<OptimizedAssetState | null>(null);
    const [sourceSceneVersion, setSourceSceneVersion] = useState(0);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [compareState, setCompareState] = useState<ScreenshotCompareState | null>(null);
    const [isComparing, setIsComparing] = useState(false);
    const [sourceAssetInfo, setSourceAssetInfo] = useState<GltfAssetInfo | null>(null);
    const [sourceAssetFeatures, setSourceAssetFeatures] = useState<AssetFeatures | null>(null);
    const [activeAssetKind, setActiveAssetKind] = useState<LoadedAssetKind | null>(null);
    const [loadedPrimaryFileName, setLoadedPrimaryFileName] = useState("");
    const [editedDownloadFileName, setEditedDownloadFileName] = useState("");
    const [downloadFileNameDraft, setDownloadFileNameDraft] = useState("");
    const [isEditingDownloadFileName, setIsEditingDownloadFileName] = useState(false);
    const lastOptimizedSettingsSignatureRef = useRef<string | null>(null);
    const sourceAssetInfoRequestIdRef = useRef(0);
    const previousExpectedDownloadFileNameRef = useRef("");
    const previousOptimizedDownloadFileNameRef = useRef("");
    const settingsRef = useRef(settings);
    const compressionPreferenceRef = useRef(compressionPreference);
    const optimizedAssetRef = useRef(optimizedAsset);
    const editedDownloadFileNameRef = useRef(editedDownloadFileName);

    const viewerOptimizedAsset = useMemo(() => {
        if (!optimizedAsset) {
            return null;
        }

        return {
            url: optimizedAsset.previewUrl,
            kind: optimizedAsset.previewKind,
        };
    }, [optimizedAsset]);

    const expectedDownloadFileNameFromLoadedAsset = useMemo(() => {
        if (!loadedPrimaryFileName || !activeAssetKind) {
            return "";
        }

        return getExpectedDownloadFileName(
            {
                kind: activeAssetKind,
                primaryFileName: loadedPrimaryFileName,
            },
            settings
        );
    }, [loadedPrimaryFileName, activeAssetKind, settings]);

    const resolvedDownloadFileName = editedDownloadFileName.trim() || optimizedAsset?.downloadFileName || expectedDownloadFileNameFromLoadedAsset;
    const compressionConflictWarning = useMemo(
        () => getCompressionConflictWarning(settings, compressionPreference, sourceAssetFeatures, activeAssetKind),
        [settings, compressionPreference, sourceAssetFeatures, activeAssetKind]
    );

    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    useEffect(() => {
        compressionPreferenceRef.current = compressionPreference;
    }, [compressionPreference]);

    useEffect(() => {
        optimizedAssetRef.current = optimizedAsset;
    }, [optimizedAsset]);

    useEffect(() => {
        editedDownloadFileNameRef.current = editedDownloadFileName;
    }, [editedDownloadFileName]);

    useEffect(() => {
        const previousExpectedDownloadFileName = previousExpectedDownloadFileNameRef.current;
        const previousOptimizedDownloadFileName = previousOptimizedDownloadFileNameRef.current;
        const trimmedEditedDownloadFileName = editedDownloadFileName.trim();
        const nextAutomaticDownloadFileName = optimizedAsset?.downloadFileName || expectedDownloadFileNameFromLoadedAsset;

        if (
            trimmedEditedDownloadFileName &&
            nextAutomaticDownloadFileName &&
            (trimmedEditedDownloadFileName === previousExpectedDownloadFileName ||
                trimmedEditedDownloadFileName === previousOptimizedDownloadFileName) &&
            trimmedEditedDownloadFileName !== nextAutomaticDownloadFileName
        ) {
            setEditedDownloadFileName(nextAutomaticDownloadFileName);
            if (!isEditingDownloadFileName) {
                setDownloadFileNameDraft(nextAutomaticDownloadFileName);
            }
        }

        previousExpectedDownloadFileNameRef.current = expectedDownloadFileNameFromLoadedAsset;
        previousOptimizedDownloadFileNameRef.current = optimizedAsset?.downloadFileName ?? "";
    }, [editedDownloadFileName, expectedDownloadFileNameFromLoadedAsset, isEditingDownloadFileName, optimizedAsset?.downloadFileName]);

    useEffect(() => {
        return () => {
            if (!optimizedAsset) {
                return;
            }

            URL.revokeObjectURL(optimizedAsset.url);
            if (optimizedAsset.previewUrl !== optimizedAsset.url) {
                URL.revokeObjectURL(optimizedAsset.previewUrl);
            }
        };
    }, [optimizedAsset]);

    const updateSourceStatusFromLoadedAsset = useCallback(() => {
        const asset = viewerRef.current?.getLoadedAssetInfo();
        if (!asset) {
            return;
        }

        const totalSizeBytes = asset.files.reduce((sum, file) => sum + file.size, 0);
        void detectAssetFeaturesFromLoadedAsset(asset).then((features) => {
            setSourceAssetFeatures(features);
            setStatus((current) => ({
                ...current,
                sourceName: asset.primaryFileName,
                sourceLabel: formatMegabytes(totalSizeBytes),
                sourceCompression: features.headerLabel,
            }));
        });
    }, [viewerRef]);

    const resetOptimizedStatus = useCallback(() => {
        setStatus((current) => ({
            ...current,
            optimizedLabel: "Converted Size",
            optimizedCompression: "No Compression",
        }));
    }, []);

    const getOptimizationSourceFeatures = useCallback(async (asset: LoadedAssetInfo) => {
        if (asset.kind !== "scene") {
            return null;
        }

        const features = await detectAssetFeaturesFromLoadedAsset(asset);
        setSourceAssetFeatures(features);
        return features;
    }, []);

    const handleSourceAssetLoaded = useCallback(
        async (asset: LoadedAssetInfo, reason: "load" | "reload") => {
            const latestSettings = settingsRef.current;
            const latestCompressionPreference = compressionPreferenceRef.current;
            const latestOptimizedAsset = optimizedAssetRef.current;
            const latestEditedDownloadFileName = editedDownloadFileNameRef.current;
            const requestId = ++sourceAssetInfoRequestIdRef.current;

            setSourceSceneVersion((current) => current + 1);
            setCompareState(null);
            setActiveAssetKind(asset.kind);
            setLoadedPrimaryFileName(asset.primaryFileName);

            if (asset.kind === "scene") {
                void detectAssetFeaturesFromLoadedAsset(asset).then((features) => {
                    if (sourceAssetInfoRequestIdRef.current !== requestId) {
                        return;
                    }

                    setSourceAssetFeatures(features);
                });
                void extractGltfAssetInfoFromLoadedAsset(asset).then((info) => {
                    if (sourceAssetInfoRequestIdRef.current !== requestId) {
                        return;
                    }

                    setSourceAssetInfo(info);
                });
            } else {
                setSourceAssetInfo(null);
                setSourceAssetFeatures(null);
            }

            if (reason === "load") {
                if (latestOptimizedAsset) {
                    URL.revokeObjectURL(latestOptimizedAsset.url);
                    if (latestOptimizedAsset.previewUrl !== latestOptimizedAsset.url) {
                        URL.revokeObjectURL(latestOptimizedAsset.previewUrl);
                    }
                    setOptimizedAsset(null);
                }
                setEditedDownloadFileName("");
                setDownloadFileNameDraft("");
                setIsEditingDownloadFileName(false);
                lastOptimizedSettingsSignatureRef.current = null;
                setAnimationState(emptyAnimationState);
                resetOptimizedStatus();
                updateSourceStatusFromLoadedAsset();
                return;
            }

            updateSourceStatusFromLoadedAsset();

            if (!latestOptimizedAsset || !lastOptimizedSettingsSignatureRef.current) {
                resetOptimizedStatus();
                return;
            }

            if (lastOptimizedSettingsSignatureRef.current === getOptimizationSignature(latestSettings, latestCompressionPreference)) {
                return;
            }

            setIsOptimizing(true);
            if (!latestEditedDownloadFileName.trim()) {
                setEditedDownloadFileName(getExpectedDownloadFileName(asset, latestSettings));
            }
            setStatus((current) => ({
                ...current,
                message: `Reloaded ${asset.primaryFileName}. Re-running optimization with updated settings...`,
                warning: getCompressionConflictWarning(latestSettings, latestCompressionPreference, sourceAssetFeatures, asset.kind),
            }));

            try {
                const optimizationSourceFeatures = await getOptimizationSourceFeatures(asset);
                const renderingSuspension = viewerRef.current?.suspendRendering();
                try {
                    const result = await optimizeLoadedAsset(
                        asset,
                        getEffectiveOptimizationSettings(
                            latestSettings,
                            latestCompressionPreference,
                            optimizationSourceFeatures,
                            asset.kind
                        )
                    );
                    setStatus((current) => ({
                        ...current,
                        message: `Optimization output generated for ${result.downloadFileName}. Finalizing preview and download state...`,
                    }));
                    if (latestOptimizedAsset) {
                        URL.revokeObjectURL(latestOptimizedAsset.url);
                        if (latestOptimizedAsset.previewUrl !== latestOptimizedAsset.url) {
                            URL.revokeObjectURL(latestOptimizedAsset.previewUrl);
                        }
                    }
                    setOptimizedAsset({
                        url: result.objectUrl,
                        kind: result.kind,
                        downloadFileName: result.downloadFileName,
                        previewUrl: result.previewObjectUrl,
                        previewKind: result.previewKind,
                    });
                    setEditedDownloadFileName(result.downloadFileName);
                    setDownloadFileNameDraft(result.downloadFileName);
                    setIsEditingDownloadFileName(false);
                    lastOptimizedSettingsSignatureRef.current = getOptimizationSignature(latestSettings, latestCompressionPreference);
                    setStatus((current) => ({
                        ...current,
                        optimizedLabel: formatMegabytes(result.sizeBytes),
                        optimizedCompression: result.compressionLabel,
                        message:
                            asset.kind === "texture"
                                ? latestSettings.textureExportMode === "image"
                                    ? "Reload complete. Optimized texture image and preview plane updated for the current settings."
                                    : "Reload complete. Optimized GLB plane updated for the current settings."
                                : "Reload complete. Optimized GLB updated for the current settings.",
                    }));
                } finally {
                    renderingSuspension?.dispose();
                }
            } catch (error) {
                setStatus((current) => ({
                    ...current,
                    message: error instanceof Error ? `Optimization failed after reload: ${error.message}` : "Optimization failed after reload.",
                    warning: "No optimized output was created. Check the error text above for the exact failure.",
                }));
            } finally {
                setIsOptimizing(false);
            }
        },
        [emptyAnimationState, getOptimizationSourceFeatures, resetOptimizedStatus, setAnimationState, sourceAssetFeatures, updateSourceStatusFromLoadedAsset, viewerRef]
    );

    const handleSceneInfoChange = useCallback(
        (info: ViewerSceneInfo) => {
            setStatus((current) => ({
                ...current,
                sourceName: info.sourceLabel,
                message: info.message,
                optimizedLabel: optimizedAsset ? current.optimizedLabel : "Converted Size",
            }));
            updateSourceStatusFromLoadedAsset();
        },
        [optimizedAsset, updateSourceStatusFromLoadedAsset]
    );

    const triggerOptimization = useCallback(async () => {
        const asset = viewerRef.current?.getLoadedAssetInfo();
        if (!asset) {
            setStatus((current) => ({
                ...current,
                message: "Load a `.glb`, `.gltf`, or supported texture file first.",
            }));
            return;
        }

        setIsOptimizing(true);
        const expectedDownloadFileName = getExpectedDownloadFileName(asset, settings);
        if (!editedDownloadFileName.trim()) {
            setEditedDownloadFileName(expectedDownloadFileName);
        }
        setStatus((current) => ({
            ...current,
            message: `${asset.kind === "texture" ? "Converting" : "Optimizing"} ${asset.primaryFileName}...`,
            warning:
                asset.kind === "texture"
                    ? settings.textureExportMode === "image"
                        ? "Texture-only inputs are optimized through a generated plane scene. Download exports the image, while the compare preview stays scene-based."
                        : "Texture-only inputs are wrapped on a preview plane and exported as optimized `.glb` output."
                    : compressionConflictWarning,
        }));

        try {
            const optimizationSourceFeatures = await getOptimizationSourceFeatures(asset);
            const renderingSuspension = viewerRef.current?.suspendRendering();
            try {
                const result = await optimizeLoadedAsset(
                    asset,
                    getEffectiveOptimizationSettings(settings, compressionPreference, optimizationSourceFeatures, asset.kind)
                );
                setStatus((current) => ({
                    ...current,
                    message: `Optimization output generated for ${result.downloadFileName}. Finalizing preview and download state...`,
                }));
                if (optimizedAsset) {
                    URL.revokeObjectURL(optimizedAsset.url);
                    if (optimizedAsset.previewUrl !== optimizedAsset.url) {
                        URL.revokeObjectURL(optimizedAsset.previewUrl);
                    }
                }

                setOptimizedAsset({
                    url: result.objectUrl,
                    kind: result.kind,
                    downloadFileName: result.downloadFileName,
                    previewUrl: result.previewObjectUrl,
                    previewKind: result.previewKind,
                });
                setEditedDownloadFileName(result.downloadFileName);
                setDownloadFileNameDraft(result.downloadFileName);
                setIsEditingDownloadFileName(false);
                lastOptimizedSettingsSignatureRef.current = getOptimizationSignature(settings, compressionPreference);
                setStatus((current) => ({
                    ...current,
                    optimizedLabel: formatMegabytes(result.sizeBytes),
                    optimizedCompression: result.compressionLabel,
                        message:
                            asset.kind === "texture"
                                ? settings.textureExportMode === "image"
                                    ? "Texture optimization complete. The optimized image is ready to download, and the updated preview plane is shown on the right."
                                    : "Texture optimization complete. The optimized GLB plane is ready to download."
                            : `Optimization complete. The optimized ${getSceneExportLabel(settings.sceneExportMode)} is ready to download.`,
                }));
            } finally {
                renderingSuspension?.dispose();
            }
        } catch (error) {
            setStatus((current) => ({
                ...current,
                message: error instanceof Error ? `Optimization failed: ${error.message}` : "Optimization failed.",
                warning: "No optimized output was created. Check the error text above for the exact failure.",
            }));
        } finally {
            setIsOptimizing(false);
        }
    }, [compressionConflictWarning, compressionPreference, editedDownloadFileName, getOptimizationSourceFeatures, optimizedAsset, settings, viewerRef]);

    const downloadOptimizedAsset = useCallback(() => {
        if (!optimizedAsset) {
            setStatus((current) => ({
                ...current,
                message: "Run optimization first to generate a downloadable file.",
            }));
            return;
        }

        const link = document.createElement("a");
        link.href = optimizedAsset.url;
        link.download = resolvedDownloadFileName;
        link.click();
        const activeAsset = viewerRef.current?.getLoadedAssetInfo();
        if (activeAsset?.kind === "texture") {
            setStatus((current) => ({
                ...current,
                message: `Downloaded optimized ${getTextureExportLabel(settings.textureExportMode)} output.`,
            }));
        }
    }, [optimizedAsset, resolvedDownloadFileName, settings.textureExportMode, viewerRef]);

    const runScreenshotCompare = useCallback(async () => {
        if (!optimizedAsset) {
            setStatus((current) => ({
                ...current,
                message: "Run optimization first so the compare workflow has an optimized view to measure.",
            }));
            return;
        }

        setIsComparing(true);
        try {
            const result = await viewerRef.current?.compareScreenshots();
            if (!result) {
                return;
            }

            const activeAsset = viewerRef.current?.getLoadedAssetInfo();
            setCompareState({
                mismatchedPixels: result.mismatchedPixels,
                errorPercentage: result.errorPercentage,
                diffDataUrl: result.diffDataUrl,
            });
            setStatus((current) => ({
                ...current,
                message:
                    activeAsset?.kind === "texture" && settings.textureExportMode === "image"
                        ? `Preview compare complete: ${result.mismatchedPixels} mismatched pixels, ${result.errorPercentage}% error between the source plane and optimized preview plane.`
                        : `Screenshot compare complete: ${result.mismatchedPixels} mismatched pixels, ${result.errorPercentage}% error.`,
                warning: "",
            }));
        } catch (error) {
            setStatus((current) => ({
                ...current,
                message: error instanceof Error ? error.message : "Screenshot compare failed.",
                warning: "",
            }));
        } finally {
            setIsComparing(false);
        }
    }, [optimizedAsset, settings.textureExportMode, viewerRef]);

    return {
        status,
        setStatus,
        optimizedAsset,
        viewerOptimizedAsset,
        sourceSceneVersion,
        isOptimizing,
        compareState,
        isComparing,
        sourceAssetInfo,
        sourceAssetFeatures,
        activeAssetKind,
        loadedPrimaryFileName,
        editedDownloadFileName,
        setEditedDownloadFileName,
        downloadFileNameDraft,
        setDownloadFileNameDraft,
        isEditingDownloadFileName,
        setIsEditingDownloadFileName,
        resolvedDownloadFileName,
        compressionConflictWarning,
        handleSourceAssetLoaded,
        handleSceneInfoChange,
        triggerOptimization,
        downloadOptimizedAsset,
        runScreenshotCompare,
    };
}
