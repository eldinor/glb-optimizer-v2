import { useEffect, useMemo, useRef, useState } from "react";
import type { AppStatus, LoadedAssetKind, ScreenshotCompareState } from "./model";
import { DEFAULT_SETTINGS } from "./defaultSettings";
import { usePersistentSettings } from "./usePersistentSettings";
import { SettingsPanel } from "../components/SettingsPanel";
import { ViewerCanvas, type ViewerCanvasHandle } from "../components/ViewerCanvas";
import { AnimationControls } from "../components/AnimationControls";
import type { AnimationControlsController, AnimationControlsState } from "../components/AnimationControls.types";
import { ENVIRONMENT_PRESETS } from "./environmentPresets";
import { optimizeLoadedAsset } from "./optimizer";
import { detectAssetFeaturesFromLoadedAsset } from "../features/assetFeatures/detectAssetFeatures";
import "./App.css";

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

export function App() {
    const { settings, setSettings, resetSettings } = usePersistentSettings();
    const [status, setStatus] = useState<AppStatus>(INITIAL_STATUS);
    const [selectedEnvironmentId, setSelectedEnvironmentId] = useState(ENVIRONMENT_PRESETS[0].id);
    const [skyboxEnabled, setSkyboxEnabled] = useState(true);
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
    const viewerRef = useRef<ViewerCanvasHandle | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const lastOptimizedSettingsSignatureRef = useRef<string | null>(null);

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

    const selectedEnvironment = useMemo(() => {
        return ENVIRONMENT_PRESETS.find((preset) => preset.id === selectedEnvironmentId) ?? ENVIRONMENT_PRESETS[0];
    }, [selectedEnvironmentId]);

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

    const updateSourceStatusFromLoadedAsset = () => {
        const asset = viewerRef.current?.getLoadedAssetInfo();
        if (!asset) {
            return;
        }

        const totalSizeBytes = asset.files.reduce((sum, file) => sum + file.size, 0);
        void detectAssetFeaturesFromLoadedAsset(asset).then((features) =>
            setStatus((current) => ({
                ...current,
                sourceName: asset.primaryFileName,
                sourceLabel: formatMegabytes(totalSizeBytes),
                sourceCompression: features.headerLabel,
            }))
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
            setStatus((current) => ({
                ...current,
                message: `${asset.kind === "texture" ? "Converting" : "Optimizing"} ${asset.primaryFileName}...`,
                warning:
                    asset.kind === "texture"
                        ? settings.textureExportMode === "image"
                            ? "Texture-only inputs are optimized through a generated plane scene, then exported as an image."
                            : "Texture-only inputs are wrapped on a preview plane and exported as optimized `.glb` output."
                        : "Optimization currently exports `.glb` output only.",
            }));

        try {
            const result = await optimizeLoadedAsset(asset, settings);
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
            lastOptimizedSettingsSignatureRef.current = getSettingsSignature(settings);
            setStatus((current) => ({
                ...current,
                optimizedLabel: formatMegabytes(result.sizeBytes),
                optimizedCompression: result.compressionLabel,
                message:
                    asset.kind === "texture"
                        ? settings.textureExportMode === "image"
                            ? "Texture optimization complete. The optimized image is ready to download, and the updated plane preview is shown on the right."
                            : "Texture optimization complete. The optimized GLB preview is ready to download."
                        : "Optimization complete. The optimized GLB is ready to download.",
            }));
        } catch (error) {
            setStatus((current) => ({
                ...current,
                message: error instanceof Error ? error.message : "Optimization failed.",
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
        link.download = optimizedAsset.downloadFileName;
        link.click();
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

            setCompareState({
                mismatchedPixels: result.mismatchedPixels,
                errorPercentage: result.errorPercentage,
                diffDataUrl: result.diffDataUrl,
            });
            setStatus((current) => ({
                ...current,
                message: `Screenshot compare complete: ${result.mismatchedPixels} mismatched pixels, ${result.errorPercentage}% error.`,
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
                        <span className="topMetricLabel">Original Size</span>
                        <strong>{status.sourceLabel}</strong>
                        <span className="topMetricLabel">
                            {status.sourceName} | {status.sourceCompression}
                        </span>
                    </div>
                    <div className="topColumn">
                        <span className="topMetricLabel">Converted Size</span>
                        <strong>{status.optimizedLabel}</strong>
                        <span className="topMetricLabel">{status.optimizedCompression}</span>
                    </div>
                </div>
                <div className="topInfo">{status.message}</div>
                {status.warning ? <div className="topInfoSecondary">{status.warning}</div> : null}
            </header>

            {settingsOpen ? (
                <div className="overlayContainer">
                    <div className="panelOverlay">
                        <div className="overlayHeader">
                            <h2>Settings</h2>
                            <button className="overlayClose" type="button" onClick={() => setSettingsOpen(false)}>
                                Close
                            </button>
                        </div>
                        <SettingsPanel
                            settings={settings}
                            defaultSettings={DEFAULT_SETTINGS}
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
                            <button className="overlayClose" type="button" onClick={() => setHelpOpen(false)}>
                                Close
                            </button>
                        </div>
                        <div className="helpContent">
                            <p>Open a scene or supported texture, adjust settings, then run optimization or conversion before downloading the result.</p>
                            <h3>Basic Optimization</h3>
                            <p>Dedup, Prune, Flatten, Join, Resample, Weld, Simplify, Quantize, Reorder, Meshopt, and KTX2 texture modes are available from Settings.</p>
                            <h3>Compare View</h3>
                            <p>The left half shows the source scene. The right half shows the optimized GLB. Screenshot compare overlays the diff image on the optimized side.</p>
                            <h3>Files</h3>
                            <p>Use Open or drag files onto the render area. `.glb` and `.gltf` are optimized to `.glb`. Standalone PNG, JPG, JPEG, and WEBP textures can be optimized through a generated plane and exported either as an image or as a GLB plane.</p>
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
                    optimizedAsset={optimizedAsset ? { url: optimizedAsset.previewUrl, kind: optimizedAsset.previewKind } : null}
                    sourceSceneVersion={sourceSceneVersion}
                    onSourceAssetLoaded={async (asset, reason) => {
                        setSourceSceneVersion((current) => current + 1);
                        setCompareState(null);

                        if (reason === "load") {
                            if (optimizedAsset) {
                                URL.revokeObjectURL(optimizedAsset.url);
                                if (optimizedAsset.previewUrl !== optimizedAsset.url) {
                                    URL.revokeObjectURL(optimizedAsset.previewUrl);
                                }
                                setOptimizedAsset(null);
                            }
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
                        setStatus((current) => ({
                            ...current,
                            message: `Reloaded ${asset.primaryFileName}. Re-running optimization with updated settings...`,
                        }));

                        try {
                            const result = await optimizeLoadedAsset(asset, settings);
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
                            lastOptimizedSettingsSignatureRef.current = getSettingsSignature(settings);
                            setStatus((current) => ({
                                ...current,
                                optimizedLabel: formatMegabytes(result.sizeBytes),
                                optimizedCompression: result.compressionLabel,
                                message:
                                    asset.kind === "texture"
                                        ? settings.textureExportMode === "image"
                                            ? "Reload complete. Optimized texture image and plane preview updated for the current settings."
                                            : "Reload complete. Optimized texture preview GLB updated for the current settings."
                                        : "Reload complete. Optimized GLB updated for the current settings.",
                            }));
                        } catch (error) {
                            setStatus((current) => ({
                                ...current,
                                message: error instanceof Error ? error.message : "Optimization failed after reload.",
                            }));
                        } finally {
                            setIsOptimizing(false);
                        }
                    }}
                    onSceneInfoChange={(info) => {
                        setStatus((current) => ({
                            ...current,
                            sourceName: info.sourceLabel,
                            message: info.message,
                            optimizedLabel: optimizedAsset ? current.optimizedLabel : "Converted Size",
                        }));
                        updateSourceStatusFromLoadedAsset();
                    }}
                    onAnimationStateChange={(animationState) => {
                        setAnimationState(animationState);
                    }}
                />
            </main>

            <footer className="footerBar">
                <div className="footerCluster footerBrand">
                    <div className="brandTitle">New Sandbox</div>
                    <div className="brandMeta">{textureModeLabel}</div>
                </div>

                <div className="footerCluster">
                    <button className="footerButton footerPrimary" type="button" onClick={() => fileInputRef.current?.click()}>
                        Open
                    </button>
                    <label className="footerSelect">
                        <span>Environment</span>
                        <select
                            value={selectedEnvironmentId}
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
                    <button
                        className="footerButton"
                        type="button"
                        onClick={async () => {
                            await viewerRef.current?.toggleInspector();
                        }}
                    >
                        Inspector
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
                        {skyboxEnabled ? "Skybox On" : "Skybox Off"}
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
                        {wireframeEnabled ? "Solid" : "Wireframe"}
                    </button>
                </div>

                <div className="footerCluster">
                    <AnimationControls
                        state={animationState}
                        controller={animationController}
                    />
                    <button className="footerButton footerAccent" type="button" onClick={triggerOptimization} disabled={isOptimizing}>
                        {isOptimizing
                            ? "Optimizing..."
                            : viewerRef.current?.getLoadedAssetInfo()?.kind === "texture"
                              ? "Convert Texture"
                              : "Optimize GLB"}
                    </button>
                    <button className="footerButton" type="button" onClick={downloadOptimizedAsset}>
                        Download
                    </button>
                    <button className="footerButton" type="button" onClick={runScreenshotCompare} disabled={isComparing}>
                        {isComparing ? "Comparing..." : "Compare"}
                    </button>
                    <button className="footerButton" type="button" onClick={() => setSettingsOpen((current) => !current)}>
                        Settings
                    </button>
                    <button className="footerButton" type="button" onClick={() => setHelpOpen((current) => !current)}>
                        Help
                    </button>
                    <button
                        className="footerButton"
                        type="button"
                        onClick={() => {
                            resetSettings();
                            setStatus({
                                ...INITIAL_STATUS,
                                message: "Settings restored to defaults.",
                            });
                        }}
                    >
                        Reset
                    </button>
                </div>
            </footer>

            {compareState ? (
                <div className="compareBadge">
                    {compareState.mismatchedPixels} mismatched pixels, {compareState.errorPercentage}% error
                </div>
            ) : null}
        </div>
    );
}
