import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppStatus, LoadedAssetKind, ScreenshotCompareState } from "./model";
import { Button, FluentProvider, webLightTheme } from "@fluentui/react-components";
import type { AssetFeatures } from "../features/assetFeatures/detectAssetFeatures";
import {
    ArrowClockwiseRegular,
    ArrowDownloadRegular,
    ArrowResetRegular,
    CubeCheckmarkRegular,
    FolderOpenRegular,
    GridRegular,
    ImageMultipleRegular,
    PersonCircleRegular,
    QuestionCircleRegular,
    SettingsRegular,
    WeatherSunnyHighRegular,
    WeatherSunnyRegular,
} from "@fluentui/react-icons";
import { DEFAULT_SETTINGS } from "./defaultSettings";
import { usePersistentSettings } from "./usePersistentSettings";
import { SettingsPanel } from "../components/SettingsPanel";
import { ViewerCanvas, type ViewerCanvasHandle } from "../components/ViewerCanvas";
import { AnimationControls } from "../components/AnimationControls";
import { AssetInfoPanel } from "../components/AssetInfoPanel";
import { ChosenSettingsPanel } from "../components/ChosenSettingsPanel";
import type { AnimationControlsController, AnimationControlsState } from "../components/AnimationControls.types";
import { ENVIRONMENT_PRESETS } from "./environmentPresets";
import { optimizeLoadedAsset } from "./optimizer";
import { detectAssetFeaturesFromLoadedAsset } from "../features/assetFeatures/detectAssetFeatures";
import { extractGltfAssetInfoFromLoadedAsset, type GltfAssetInfo } from "../features/assetFeatures/extractGltfAssetInfo";
import "./App.css";

type CompressionPreference = "uncompress" | "keep-same";
const USER_SETTINGS_STORAGE_KEY = "newsandbox.optimizer.user-settings";

const INITIAL_STATUS: AppStatus = {
    sourceName: "Awaiting file import",
    sourceLabel: "Awaiting file import",
    sourceCompression: "No Compression",
    optimizedLabel: "Converted Size",
    optimizedCompression: "No Compression",
    message: "Open a scene or supported texture, or drop files onto the render area.",
    warning: "",
};

const EMPTY_ANIMATION_STATE: AnimationControlsState = {
    hasAnimations: false,
    isPlaying: false,
    currentFrame: 0,
    fromFrame: 0,
    toFrame: 0,
    groupIndex: 0,
    groupNames: [],
};
function formatMegabytes(sizeBytes: number): string {
    return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getSettingsSignature(settings: unknown) {
    return JSON.stringify(settings);
}

function getTextureExportLabel(exportMode: "image" | "glb-plane") {
    return exportMode === "image" ? "image" : "GLB plane";
}

function getExpectedDownloadFileName(
    asset: { kind: LoadedAssetKind; primaryFileName: string },
    settings: typeof DEFAULT_SETTINGS
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

    return `${baseName}-opt.glb`;
}

function readCompressionPreference(): CompressionPreference {
    if (typeof window === "undefined") {
        return "uncompress";
    }

    const rawValue = window.localStorage.getItem(USER_SETTINGS_STORAGE_KEY);
    return rawValue === "keep-same" ? "keep-same" : "uncompress";
}

function getCompressionConflictWarning(
    settings: typeof DEFAULT_SETTINGS,
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
    settings: typeof DEFAULT_SETTINGS,
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

export function App() {
    const { settings, setSettings, resetSettings } = usePersistentSettings();
    const [status, setStatus] = useState<AppStatus>(INITIAL_STATUS);
    const [selectedEnvironmentId, setSelectedEnvironmentId] = useState(ENVIRONMENT_PRESETS[0].id);
    const [skyboxEnabled, setSkyboxEnabled] = useState(false);
    const [wireframeEnabled, setWireframeEnabled] = useState(false);
    const [optimizedAsset, setOptimizedAsset] = useState<{
        url: string;
        kind: LoadedAssetKind;
        downloadFileName: string;
        previewUrl: string;
        previewKind: LoadedAssetKind;
    } | null>(null);
    const [sourceSceneVersion, setSourceSceneVersion] = useState(0);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [compareState, setCompareState] = useState<ScreenshotCompareState | null>(null);
    const [isComparing, setIsComparing] = useState(false);
    const [animationState, setAnimationState] = useState<AnimationControlsState>(EMPTY_ANIMATION_STATE);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const [userSettingsOpen, setUserSettingsOpen] = useState(false);
    const [footerHidden, setFooterHidden] = useState(false);
    const [sourceAssetInfo, setSourceAssetInfo] = useState<GltfAssetInfo | null>(null);
    const [sourceAssetFeatures, setSourceAssetFeatures] = useState<AssetFeatures | null>(null);
    const [activeAssetKind, setActiveAssetKind] = useState<LoadedAssetKind | null>(null);
    const [loadedPrimaryFileName, setLoadedPrimaryFileName] = useState("");
    const [compressionPreference, setCompressionPreference] = useState<CompressionPreference>(readCompressionPreference);
    const [editedDownloadFileName, setEditedDownloadFileName] = useState("");
    const [downloadFileNameDraft, setDownloadFileNameDraft] = useState("");
    const [isEditingDownloadFileName, setIsEditingDownloadFileName] = useState(false);
    const viewerRef = useRef<ViewerCanvasHandle | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const downloadFileNameInputRef = useRef<HTMLInputElement | null>(null);
    const lastOptimizedSettingsSignatureRef = useRef<string | null>(null);
    const sourceAssetInfoRequestIdRef = useRef(0);

    const textureModeLabel = useMemo(() => {
        return {
            keep: "Keep Original",
            webp: "WEBP",
            png: "PNG",
            "ktx2-uastc": "KTX2 UASTC",
            "ktx2-etc1s": "KTX2 ETC1S",
            "ktx2-mix": "KTX2 MIX",
            "ktx2-user": "KTX2 USER",
        }[settings.textureMode];
    }, [settings.textureMode]);

    const viewerOptimizedAsset = useMemo(() => {
        if (!optimizedAsset) {
            return null;
        }

        return {
            url: optimizedAsset.previewUrl,
            kind: optimizedAsset.previewKind,
        };
    }, [optimizedAsset]);

    const selectedEnvironment = useMemo(() => {
        return ENVIRONMENT_PRESETS.find((preset) => preset.id === selectedEnvironmentId) ?? ENVIRONMENT_PRESETS[0];
    }, [selectedEnvironmentId]);

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
    const hasRealOptimizedOutput = Boolean(editedDownloadFileName.trim() || optimizedAsset?.downloadFileName);
    const compressionConflictWarning = useMemo(
        () => getCompressionConflictWarning(settings, compressionPreference, sourceAssetFeatures, activeAssetKind),
        [settings, compressionPreference, sourceAssetFeatures, activeAssetKind]
    );

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

    useEffect(() => {
        if (!isEditingDownloadFileName) {
            return;
        }

        downloadFileNameInputRef.current?.focus();
        downloadFileNameInputRef.current?.select();
    }, [isEditingDownloadFileName]);

    useEffect(() => {
        window.localStorage.setItem(USER_SETTINGS_STORAGE_KEY, compressionPreference);
    }, [compressionPreference]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (
                target &&
                (target instanceof HTMLInputElement ||
                    target instanceof HTMLTextAreaElement ||
                    target instanceof HTMLSelectElement ||
                    target.isContentEditable)
            ) {
                return;
            }

            if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
                return;
            }

            // Use both code and key so the shortcut stays reliable across keyboard layouts.
            if (event.code !== "Space" && event.key !== " " && event.key !== "Spacebar") {
                return;
            }

            event.preventDefault();
            setFooterHidden((current) => !current);
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, []);

    const updateSourceStatusFromLoadedAsset = () => {
        const asset = viewerRef.current?.getLoadedAssetInfo();
        if (!asset) {
            return;
        }

        const totalSizeBytes = asset.files.reduce((sum, file) => sum + file.size, 0);
        void detectAssetFeaturesFromLoadedAsset(asset).then((features) =>
            {
                setSourceAssetFeatures(features);
                setStatus((current) => ({
                    ...current,
                    sourceName: asset.primaryFileName,
                    sourceLabel: formatMegabytes(totalSizeBytes),
                    sourceCompression: features.headerLabel,
                }));
            }
        );
    };

    const resetOptimizedStatus = () => {
        setStatus((current) => ({
            ...current,
            optimizedLabel: "Converted Size",
            optimizedCompression: "No Compression",
        }));
    };

    const toggleAnimationPlayback = () => {
        const animationState = viewerRef.current?.toggleAnimationPlayback();
        if (!animationState) {
            return;
        }

        setAnimationState(animationState);
        setStatus((current) => ({
            ...current,
            message: animationState.hasAnimations
                ? `Animation ${animationState.isPlaying ? "playing" : "paused"}.`
                : "No animation groups found in the current scene.",
        }));
    };

    const setAnimationFrame = (frame: number) => {
        const nextState = viewerRef.current?.setAnimationFrame(frame);
        if (!nextState) {
            return;
        }

        setAnimationState(nextState);
    };

    const setActiveAnimationGroup = (groupIndex: number) => {
        const nextState = viewerRef.current?.setActiveAnimationGroup(groupIndex);
        if (!nextState) {
            return;
        }

        setAnimationState(nextState);
        setStatus((current) => ({
            ...current,
            message: `Active animation changed to ${nextState.groupNames[nextState.groupIndex] || `Animation ${nextState.groupIndex + 1}`}.`,
        }));
    };

    const animationController = useMemo<AnimationControlsController>(
        () => ({
            togglePlayback: toggleAnimationPlayback,
            setFrame: setAnimationFrame,
            setGroupIndex: setActiveAnimationGroup,
        }),
        []
    );

    const getOptimizationSourceFeatures = useCallback(async (asset: { kind: LoadedAssetKind; primaryFileName: string; files: File[] }) => {
        if (asset.kind !== "scene") {
            return null;
        }

        const features = await detectAssetFeaturesFromLoadedAsset(asset);
        setSourceAssetFeatures(features);
        return features;
    }, []);

    const handleSourceAssetLoaded = useCallback(
        async (asset: { kind: LoadedAssetKind; primaryFileName: string; files: File[] }, reason: "load" | "reload") => {
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
                if (optimizedAsset) {
                    URL.revokeObjectURL(optimizedAsset.url);
                    if (optimizedAsset.previewUrl !== optimizedAsset.url) {
                        URL.revokeObjectURL(optimizedAsset.previewUrl);
                    }
                    setOptimizedAsset(null);
                }
                setEditedDownloadFileName("");
                setDownloadFileNameDraft("");
                setIsEditingDownloadFileName(false);
                lastOptimizedSettingsSignatureRef.current = null;
                setAnimationState(EMPTY_ANIMATION_STATE);
                resetOptimizedStatus();
                updateSourceStatusFromLoadedAsset();
                return;
            }

            updateSourceStatusFromLoadedAsset();

            if (!optimizedAsset || !lastOptimizedSettingsSignatureRef.current) {
                resetOptimizedStatus();
                return;
            }

            if (lastOptimizedSettingsSignatureRef.current === getSettingsSignature(settings)) {
                return;
            }

            setIsOptimizing(true);
            if (!editedDownloadFileName.trim()) {
                setEditedDownloadFileName(getExpectedDownloadFileName(asset, settings));
            }
            setStatus((current) => ({
                ...current,
                message: `Reloaded ${asset.primaryFileName}. Re-running optimization with updated settings...`,
                warning: compressionConflictWarning,
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
                    lastOptimizedSettingsSignatureRef.current = getSettingsSignature(settings);
                    setStatus((current) => ({
                        ...current,
                        optimizedLabel: formatMegabytes(result.sizeBytes),
                        optimizedCompression: result.compressionLabel,
                        message:
                            asset.kind === "texture"
                                ? settings.textureExportMode === "image"
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
        [optimizedAsset, settings, compressionPreference, compressionConflictWarning, getOptimizationSourceFeatures]
    );

    const handleSceneInfoChange = useCallback(
        (info: { sourceLabel: string; message: string }) => {
            setStatus((current) => ({
                ...current,
                sourceName: info.sourceLabel,
                message: info.message,
                optimizedLabel: optimizedAsset ? current.optimizedLabel : "Converted Size",
            }));
            updateSourceStatusFromLoadedAsset();
        },
        [optimizedAsset]
    );

    const handleAnimationStateChange = useCallback((nextAnimationState: AnimationControlsState) => {
        setAnimationState(nextAnimationState);
    }, []);

    const triggerOptimization = async () => {
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
                    : compressionConflictWarning || "Optimization currently exports `.glb` output only.",
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
                lastOptimizedSettingsSignatureRef.current = getSettingsSignature(settings);
                setStatus((current) => ({
                    ...current,
                    optimizedLabel: formatMegabytes(result.sizeBytes),
                    optimizedCompression: result.compressionLabel,
                    message:
                        asset.kind === "texture"
                            ? settings.textureExportMode === "image"
                                ? "Texture optimization complete. The optimized image is ready to download, and the updated preview plane is shown on the right."
                                : "Texture optimization complete. The optimized GLB plane is ready to download."
                            : "Optimization complete. The optimized GLB is ready to download.",
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
    };

    const downloadOptimizedAsset = () => {
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
    };

    const runScreenshotCompare = async () => {
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
            }));
        } catch (error) {
            setStatus((current) => ({
                ...current,
                message: error instanceof Error ? error.message : "Screenshot compare failed.",
            }));
        } finally {
            setIsComparing(false);
        }
    };

    return (
        <FluentProvider theme={webLightTheme} className="appProvider">
        <div className="appShell">
            <input
                ref={fileInputRef}
                className="hiddenInput"
                type="file"
                multiple
                accept=".glb,.gltf,.png,.jpg,.jpeg,.webp,.ktx,.ktx2"
                onChange={async (event) => {
                    if (event.target.files?.length) {
                        await viewerRef.current?.loadFiles(event.target.files);
                        event.target.value = "";
                    }
                }}
            />

            <header className="topBar">
                <div className="topBarRow">
                    <div className="topColumn">
                        <div className="topPlaceholder">
                            <span className="topPlaceholderLabel">Original</span>
                            <strong>{status.sourceLabel}</strong>
                            <span className="topPlaceholderSecondary">{status.sourceName}</span>
                        </div>
                        <div className="topPlaceholder">
                            <span className="topPlaceholderLabel">Compression</span>
                            <strong>{status.sourceCompression}</strong>
                        </div>
                        <div className="topPlaceholder">
                            <span className="topPlaceholderLabel">Source</span>
                            <strong>{activeAssetKind === "texture" ? "Texture" : "GLB"}</strong>
                        </div>
                    </div>
                    <div className="topColumn">
                        <div className="topPlaceholder">
                            <span className="topPlaceholderLabel">Converted</span>
                            <strong>{status.optimizedLabel}</strong>
                            {resolvedDownloadFileName ? (
                                <span className="topPlaceholderSecondary topEditableFileName">
                                    {isEditingDownloadFileName ? (
                                        <input
                                            ref={downloadFileNameInputRef}
                                            className="topFileNameInput"
                                            type="text"
                                            value={downloadFileNameDraft}
                                            aria-label="Optimized file name"
                                            onChange={(event) => setDownloadFileNameDraft(event.target.value)}
                                            onBlur={() => {
                                                const nextFileName = downloadFileNameDraft.trim() || resolvedDownloadFileName;
                                                setEditedDownloadFileName(nextFileName);
                                                setDownloadFileNameDraft(nextFileName);
                                                setIsEditingDownloadFileName(false);
                                            }}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter") {
                                                    const nextFileName = downloadFileNameDraft.trim() || resolvedDownloadFileName;
                                                    setEditedDownloadFileName(nextFileName);
                                                    setDownloadFileNameDraft(nextFileName);
                                                    setIsEditingDownloadFileName(false);
                                                }
                                                if (event.key === "Escape") {
                                                    setDownloadFileNameDraft(resolvedDownloadFileName);
                                                    setEditedDownloadFileName(resolvedDownloadFileName);
                                                    setIsEditingDownloadFileName(false);
                                                }
                                            }}
                                        />
                                    ) : (
                                        <>
                                            <span className="topEditableFileNameText">{resolvedDownloadFileName}</span>
                                            <button
                                                className="topEditFileNameButton"
                                                type="button"
                                                aria-label="Edit optimized file name"
                                                title="Edit optimized file name"
                                                onClick={() => {
                                                    setDownloadFileNameDraft(resolvedDownloadFileName);
                                                    setIsEditingDownloadFileName(true);
                                                }}
                                            >
                                                ✎
                                            </button>
                                        </>
                                    )}
                                </span>
                            ) : (
                                <span className="topPlaceholderSecondary">Awaiting optimized output</span>
                            )}
                        </div>
                        <div className="topPlaceholder">
                            <span className="topPlaceholderLabel">Compression</span>
                            <strong>{status.optimizedCompression}</strong>
                        </div>
                        <div className="topPlaceholder">
                            <span className="topPlaceholderLabel">Status</span>
                            <strong>{hasRealOptimizedOutput ? "Ready" : "Waiting"}</strong>
                        </div>
                    </div>
                </div>
            </header>

            <div className="topStatusStack">
                <div className="topInfo">{status.message}</div>
                {status.warning ? <div className="topInfoSecondary">{status.warning}</div> : null}
            </div>

            <div className="leftRail">
                <AssetInfoPanel info={sourceAssetInfo} />
            </div>

            <ChosenSettingsPanel settings={settings} activeAssetKind={activeAssetKind} footerHidden={footerHidden} />

            {settingsOpen ? (
                <div className="overlayContainer">
                    <div className="panelOverlay">
                        <div className="overlayHeader">
                            <h2>Settings</h2>
                            <Button className="overlayClose" appearance="subtle" onClick={() => setSettingsOpen(false)}>
                                Close
                            </Button>
                        </div>
                        <SettingsPanel
                            settings={settings}
                            defaultSettings={DEFAULT_SETTINGS}
                            activeAssetKind={viewerRef.current?.getLoadedAssetInfo()?.kind ?? null}
                            onSettingsChange={setSettings}
                            onExplainStage={(message) =>
                                setStatus((current) => ({
                                    ...current,
                                    message,
                                }))
                            }
                        />
                    </div>
                </div>
            ) : null}

            {helpOpen ? (
                <div className="overlayContainer">
                    <div className="helpOverlay">
                        <div className="overlayHeader">
                            <h2>Help</h2>
                            <Button className="overlayClose" appearance="subtle" onClick={() => setHelpOpen(false)}>
                                Close
                            </Button>
                        </div>
                        <div className="helpContent">
                            <p>Open a scene or supported texture, adjust settings, then run optimization or conversion before downloading the result.</p>
                            <h3>Basic Optimization</h3>
                            <p>Dedup, Prune, Flatten, Join, Resample, Weld, Simplify, Quantize, Reorder, Meshopt, and KTX2 texture modes are available from Settings.</p>
                            <h3>Compare View</h3>
                            <p>The left half shows the source scene. The right half shows the optimized preview scene. Screenshot compare overlays the diff image on the optimized side.</p>
                            <h3>Files</h3>
                            <p>Use Open or drag files onto the render area. `.glb` and `.gltf` are optimized to `.glb`. Standalone PNG, JPG, JPEG, and WEBP textures can be optimized through a generated plane and exported either as an image or as a GLB plane.</p>
                        </div>
                    </div>
                </div>
            ) : null}

            {userSettingsOpen ? (
                <div className="overlayContainer">
                    <div className="panelOverlay">
                        <div className="overlayHeader">
                            <h2>User Settings</h2>
                            <Button className="overlayClose" appearance="subtle" onClick={() => setUserSettingsOpen(false)}>
                                Close
                            </Button>
                        </div>
                        <div className="helpContent">
                            <p>Manage app-level preferences and restore the optimizer defaults from here.</p>
                            <label className="userSettingsField">
                                <span className="userSettingsLabel">Compression Handling</span>
                                <select
                                    className="userSettingsSelect"
                                    value={compressionPreference}
                                    onChange={(event) => setCompressionPreference(event.target.value as CompressionPreference)}
                                >
                                    <option value="uncompress">Uncompress</option>
                                    <option value="keep-same">Keep the same compression</option>
                                </select>
                            </label>
                            <p className="userSettingsHint">
                                When enabled, original Draco or Meshopt compression is reapplied with default settings only if you have not already chosen another compression method.
                            </p>
                            {compressionConflictWarning ? <p className="userSettingsWarning">{compressionConflictWarning}</p> : null}
                            <Button
                                appearance="secondary"
                                icon={<ArrowResetRegular />}
                                onClick={() => {
                                    resetSettings();
                                    setStatus({
                                        ...INITIAL_STATUS,
                                        message: "Settings restored to defaults.",
                                    });
                                }}
                            >
                                Reset Optimization Settings
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}

            <main className="viewerFrame">
                <ViewerCanvas
                    ref={viewerRef}
                    environment={selectedEnvironment}
                    skyboxEnabled={skyboxEnabled}
                    wireframeEnabled={wireframeEnabled}
                    footerHidden={footerHidden}
                    timeToWaitBeforeSuspend={settings.timeToWaitBeforeSuspend}
                    optimizedAsset={viewerOptimizedAsset}
                    sourceSceneVersion={sourceSceneVersion}
                    onSourceAssetLoaded={handleSourceAssetLoaded}
                    onSceneInfoChange={handleSceneInfoChange}
                    onAnimationStateChange={handleAnimationStateChange}
                />
            </main>

            <footer className={`footerBar${footerHidden ? " isHidden" : ""}`}>
                <div className="footerBrand">
                    <div className="brandTitle">GLB Optimizer v2 - Convert glTF and GLB files with with WEBP and KTX2 Textures online</div>
                    <div className="brandMeta">{textureModeLabel}</div>
                </div>

                <div className="footerCenterZone">
                    <div className="footerCluster footerMainActions">
                        <button className="footerButton footerPrimary" type="button" onClick={() => fileInputRef.current?.click()}>
                            <span className="footerButtonContent">
                                <FolderOpenRegular className="footerButtonIcon" />
                                <span className="footerButtonLabel">Open</span>
                            </span>
                        </button>
                        <button className="footerButton footerAccent" type="button" onClick={triggerOptimization} disabled={isOptimizing}>
                            <span className="footerButtonContent">
                                <ArrowClockwiseRegular className="footerButtonIcon" />
                                <span className="footerButtonLabel">{isOptimizing ? "Optimizing..." : "Optimize GLB"}</span>
                            </span>
                        </button>
                        <button className="footerButton" type="button" onClick={() => setSettingsOpen((current) => !current)}>
                            <span className="footerButtonContent">
                                <SettingsRegular className="footerButtonIcon" />
                                <span className="footerButtonLabel">Settings</span>
                            </span>
                        </button>
                        <button className="footerButton" type="button" onClick={runScreenshotCompare} disabled={isComparing}>
                            <span className="footerButtonContent">
                                <ImageMultipleRegular className="footerButtonIcon" />
                                <span className="footerButtonLabel">{isComparing ? "Comparing..." : "Compare"}</span>
                            </span>
                        </button>
                        <button className="footerButton" type="button" onClick={downloadOptimizedAsset}>
                            <span className="footerButtonContent">
                                <ArrowDownloadRegular className="footerButtonIcon" />
                                <span className="footerButtonLabel">Download</span>
                            </span>
                        </button>
                    </div>

                    <div className="footerCluster footerViewerActions">
                        <button
                            className="footerButton"
                            type="button"
                            onClick={async () => {
                                await viewerRef.current?.toggleInspector();
                            }}
                        >
                            <span className="footerButtonContent">
                                <CubeCheckmarkRegular className="footerButtonIcon" />
                                <span className="footerButtonLabel">Inspector</span>
                            </span>
                        </button>
                        <button
                            className="footerButton"
                            type="button"
                            onClick={() => {
                                setSkyboxEnabled((current) => {
                                    const nextValue = !current;
                                    setStatus((statusCurrent) => ({
                                        ...statusCurrent,
                                        message: `Skybox ${nextValue ? "enabled" : "disabled"}.`,
                                    }));
                                    return nextValue;
                                });
                            }}
                        >
                            <span className="footerButtonContent">
                                <WeatherSunnyRegular className="footerButtonIcon" />
                                <span className="footerButtonLabel">{skyboxEnabled ? "Skybox On" : "Skybox Off"}</span>
                            </span>
                        </button>
                        <button
                            className="footerButton"
                            type="button"
                            onClick={() => {
                                setWireframeEnabled((current) => {
                                    const nextValue = !current;
                                    setStatus((statusCurrent) => ({
                                        ...statusCurrent,
                                        message: `Wireframe ${nextValue ? "enabled" : "disabled"}.`,
                                    }));
                                    return nextValue;
                                });
                            }}
                        >
                            <span className="footerButtonContent">
                                <GridRegular className="footerButtonIcon" />
                                <span className="footerButtonLabel">{wireframeEnabled ? "Solid" : "Wireframe"}</span>
                            </span>
                        </button>
                        <label className="footerEnvironmentControl" title="HDR environment">
                            <WeatherSunnyHighRegular className="footerEnvironmentIcon" title="HDR environment" />
                            <select
                                className="footerEnvironmentSelect"
                                value={selectedEnvironmentId}
                                aria-label="Environment"
                                title="HDR environment"
                                onChange={(event) => {
                                    const nextId = event.target.value;
                                    setSelectedEnvironmentId(nextId);
                                    const nextPreset = ENVIRONMENT_PRESETS.find((preset) => preset.id === nextId);
                                    setStatus((current) => ({
                                        ...current,
                                        message: `Environment switched to ${nextPreset?.label ?? "Default"}.`,
                                    }));
                                }}
                            >
                                {ENVIRONMENT_PRESETS.map((preset) => (
                                    <option key={preset.id} value={preset.id}>
                                        {preset.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                </div>

                <div className="footerCluster footerSecondaryActions">
                    <AnimationControls
                        state={animationState}
                        controller={animationController}
                    />
                    <button className="footerButton" type="button" onClick={() => setUserSettingsOpen((current) => !current)}>
                        <span className="footerButtonContent">
                            <PersonCircleRegular className="footerButtonIcon" />
                            <span className="footerButtonLabel">User Settings</span>
                        </span>
                    </button>
                    <button className="footerButton" type="button" onClick={() => setHelpOpen((current) => !current)}>
                        <span className="footerButtonContent">
                            <QuestionCircleRegular className="footerButtonIcon" />
                            <span className="footerButtonLabel">Help</span>
                        </span>
                    </button>
                </div>
            </footer>

            {compareState ? (
                <div className="compareBadge">
                    {compareState.mismatchedPixels} mismatched pixels, {compareState.errorPercentage}% error
                </div>
            ) : null}
        </div>
        </FluentProvider>
    );
}
