import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Button, FluentProvider, webLightTheme } from "@fluentui/react-components";
import {
    ArrowClockwiseRegular,
    ArrowDownloadRegular,
    ArrowResetRegular,
    CubeCheckmarkRegular,
    EditFilled,
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
import type { AnimationControlsController, AnimationControlsState } from "../components/AnimationControls.types";
import { getChosenSettingsRows } from "../components/ChosenSettingsPanel";
import { ENVIRONMENT_PRESETS } from "./environmentPresets";
import { INITIAL_STATUS, type CompressionPreference, useOptimizationController } from "./useOptimizationController";
import "./App.css";
const USER_SETTINGS_STORAGE_KEY = "newsandbox.optimizer.user-settings";

const EMPTY_ANIMATION_STATE: AnimationControlsState = {
    hasAnimations: false,
    isPlaying: false,
    currentFrame: 0,
    fromFrame: 0,
    toFrame: 0,
    groupIndex: 0,
    groupNames: [],
};

function readCompressionPreference(): CompressionPreference {
    if (typeof window === "undefined") {
        return "uncompress";
    }

    const rawValue = window.localStorage.getItem(USER_SETTINGS_STORAGE_KEY);
    return rawValue === "keep-same" ? "keep-same" : "uncompress";
}

export function App() {
    const { settings, setSettings, resetSettings } = usePersistentSettings();
    const [selectedEnvironmentId, setSelectedEnvironmentId] = useState(ENVIRONMENT_PRESETS[0].id);
    const [skyboxEnabled, setSkyboxEnabled] = useState(false);
    const [wireframeEnabled, setWireframeEnabled] = useState(false);
    const [animationState, setAnimationState] = useState<AnimationControlsState>(EMPTY_ANIMATION_STATE);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const [userSettingsOpen, setUserSettingsOpen] = useState(false);
    const [userSettingsTab, setUserSettingsTab] = useState<"general" | "technical">("general");
    const [footerHidden, setFooterHidden] = useState(false);
    const [compressionPreference, setCompressionPreference] = useState<CompressionPreference>(readCompressionPreference);
    const [headerCompressionMode, setHeaderCompressionMode] = useState<"draco" | "meshopt">("draco");
    const [headerHeight, setHeaderHeight] = useState(43);
    const [footerHeight, setFooterHeight] = useState(71);
    const headerRef = useRef<HTMLElement | null>(null);
    const footerRef = useRef<HTMLElement | null>(null);
    const viewerRef = useRef<ViewerCanvasHandle | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const downloadFileNameInputRef = useRef<HTMLInputElement | null>(null);

    const {
        status,
        setStatus,
        viewerOptimizedAsset,
        sourceSceneVersion,
        isOptimizing,
        isComparing,
        sourceAssetInfo,
        activeAssetKind,
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
    } = useOptimizationController({
        settings,
        compressionPreference,
        viewerRef,
        emptyAnimationState: EMPTY_ANIMATION_STATE,
        setAnimationState,
    });

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
    const chosenSettingsRows = useMemo(() => getChosenSettingsRows(settings, activeAssetKind), [settings, activeAssetKind]);
    const headerCompressionEnabled = settings.draco || settings.meshopt;

    useEffect(() => {
        if (settings.meshopt) {
            setHeaderCompressionMode("meshopt");
            return;
        }

        if (settings.draco) {
            setHeaderCompressionMode("draco");
        }
    }, [settings.draco, settings.meshopt]);

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
        const headerElement = headerRef.current;
        if (!headerElement) {
            return;
        }

        const updateHeaderHeight = () => {
            setHeaderHeight(Math.ceil(headerElement.getBoundingClientRect().height));
        };

        updateHeaderHeight();

        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", updateHeaderHeight);
            return () => {
                window.removeEventListener("resize", updateHeaderHeight);
            };
        }

        const resizeObserver = new ResizeObserver(() => {
            updateHeaderHeight();
        });
        resizeObserver.observe(headerElement);

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    useEffect(() => {
        const footerElement = footerRef.current;
        if (!footerElement) {
            return;
        }

        const updateFooterHeight = () => {
            setFooterHeight(Math.ceil(footerElement.getBoundingClientRect().height));
        };

        updateFooterHeight();

        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", updateFooterHeight);
            return () => {
                window.removeEventListener("resize", updateFooterHeight);
            };
        }

        const resizeObserver = new ResizeObserver(() => {
            updateFooterHeight();
        });
        resizeObserver.observe(footerElement);

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

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

    const handleAnimationStateChange = useCallback((nextAnimationState: AnimationControlsState) => {
        setAnimationState(nextAnimationState);
    }, []);

    const appShellStyle = {
        "--app-header-height": `${headerHeight}px`,
        "--app-footer-height": `${footerHeight}px`,
    } as CSSProperties;

    return (
        <FluentProvider theme={webLightTheme} className="appProvider">
        <div className="appShell" style={appShellStyle}>
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

            <header ref={headerRef} className="topBar">
                <div className="topBarRow">
                    <div className="topColumn topColumnSource">
                        <div className="topPlaceholder">
                            <span className="topPlaceholderLabel">Original</span>
                            <strong>{status.sourceLabel}</strong>
                            <span className="topPlaceholderSecondary">{status.sourceName}</span>
                        </div>
                        <div className="topPlaceholder">
                            <span className="topPlaceholderLabel">Compression</span>
                            <strong>{status.sourceCompression}</strong>
                            <span className="topCompressionInline">
                                <span className="topCompressionInlineLabel">Handling</span>
                                <select
                                    className="topCompressionSelect"
                                    value={compressionPreference}
                                    aria-label="Compression handling"
                                    onChange={(event) => setCompressionPreference(event.target.value as CompressionPreference)}
                                >
                                    <option value="uncompress">Uncompress</option>
                                    <option value="keep-same">Keep Same</option>
                                </select>
                            </span>
                        </div>
                        <div className="topPlaceholder">
                            <div className="topPlaceholderLabelRow">
                                <span className="topPlaceholderLabel">Texture</span>
                                <span className="topHeaderInlineText">Resize</span>
                                <select
                                    className="topHeaderInlineSelect"
                                    value={settings.resize}
                                    aria-label="Resize"
                                    onChange={(event) => {
                                        const nextValue = event.target.value as typeof settings.resize;
                                        setSettings((current) => ({
                                            ...current,
                                            resize: nextValue,
                                        }));
                                        setStatus((current) => ({
                                            ...current,
                                            message: `Resize set to ${nextValue}.`,
                                        }));
                                    }}
                                >
                                    <option value="No Resize">No Resize</option>
                                    <option value="2048">2048</option>
                                    <option value="1024">1024</option>
                                    <option value="512">512</option>
                                    <option value="256">256</option>
                                </select>
                            </div>
                            <label className="topHeaderControl topHeaderControlIndented">
                                <span className="topHeaderControlText">Format</span>
                                <select
                                    className="topHeaderSelect"
                                    value={settings.textureMode}
                                    aria-label="Format"
                                    onChange={(event) =>
                                        setSettings((current) => ({
                                            ...current,
                                            textureMode: event.target.value as typeof settings.textureMode,
                                        }))
                                    }
                                >
                                    <option value="keep">Keep Original</option>
                                    <option value="webp">WEBP</option>
                                    <option value="png">PNG</option>
                                    <option value="ktx2-uastc">KTX2 UASTC</option>
                                    <option value="ktx2-etc1s">KTX2 ETC1S</option>
                                    <option value="ktx2-mix">KTX2 MIX</option>
                                    <option value="ktx2-user">KTX2 USER</option>
                                </select>
                            </label>
                        </div>
                    </div>
                    <div className="topColumn topColumnConverted">
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
                                                <EditFilled />
                                            </button>
                                        </>
                                    )}
                                    {activeAssetKind === "scene" ? (
                                        <label className="topExportModeToggle" title="Download zipped GLTF instead of GLB">
                                            <input
                                                type="checkbox"
                                                checked={settings.sceneExportMode === "gltf-zip"}
                                                onChange={(event) => {
                                                    const checked = event.target.checked;
                                                    setSettings((current) => ({
                                                        ...current,
                                                        sceneExportMode: checked ? "gltf-zip" : "glb",
                                                    }));
                                                    setStatus((current) => ({
                                                        ...current,
                                                        message: checked
                                                            ? "Scene download mode set to zipped GLTF. Preview remains GLB."
                                                            : "Scene download mode set to GLB.",
                                                        warning: "",
                                                    }));
                                                }}
                                            />
                                            <span>GLTF</span>
                                        </label>
                                    ) : null}
                                </span>
                            ) : (
                                <span className="topPlaceholderSecondary">Awaiting optimized output</span>
                            )}
                        </div>
                        <div className="topPlaceholder">
                            <span className="topPlaceholderLabel">Compression</span>
                            <strong>{status.optimizedCompression}</strong>
                            <span className="topCompressionInline">
                                <label className="topCompressionCheckbox">
                                    <input
                                        type="checkbox"
                                        checked={headerCompressionEnabled}
                                        onChange={(event) => {
                                            const checked = event.target.checked;
                                            setSettings((current) => ({
                                                ...current,
                                                draco: checked ? headerCompressionMode === "draco" : false,
                                                meshopt: checked ? headerCompressionMode === "meshopt" : false,
                                            }));
                                        }}
                                    />
                                    <span>Compress</span>
                                </label>
                                <select
                                    className="topCompressionSelect"
                                    value={headerCompressionMode}
                                    disabled={!headerCompressionEnabled}
                                    aria-label="Compression mode"
                                    onChange={(event) => {
                                        const nextMode = event.target.value as "draco" | "meshopt";
                                        setHeaderCompressionMode(nextMode);
                                        setSettings((current) => ({
                                            ...current,
                                            draco: current.draco || current.meshopt ? nextMode === "draco" : current.draco,
                                            meshopt: current.draco || current.meshopt ? nextMode === "meshopt" : current.meshopt,
                                        }));
                                    }}
                                >
                                    <option value="draco">Draco</option>
                                    <option value="meshopt">Meshopt</option>
                                </select>
                            </span>
                        </div>
                        <div className="topPlaceholder topPlaceholderSettings topPlaceholderMerged">
                            <div className="topChosenSettingsList">
                                {chosenSettingsRows
                                    .filter((row) => row.label !== "Resize" && row.label !== "Texture")
                                    .map((row) => (
                                    <div key={row.label} className="topChosenSettingsRow">
                                        <span className="topChosenSettingsLabel">{row.label}</span>
                                        <span className="topChosenSettingsValue">{row.value}</span>
                                    </div>
                                ))}
                            </div>
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

            {settingsOpen ? (
                <div className="overlayContainer settingsOverlayContainer" onClick={() => setSettingsOpen(false)}>
                    <div className="panelOverlay settingsPanelOverlay" onClick={(event) => event.stopPropagation()}>
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
                            <p>Use Open or drag files onto the render area. `.glb` and `.gltf` scenes can be optimized for GLB download or zipped GLTF download. Standalone PNG, JPG, JPEG, and WEBP textures can be optimized through a generated plane and exported either as an image or as a GLB plane.</p>
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
                            <div className="userSettingsTabs" role="tablist" aria-label="User settings sections">
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={userSettingsTab === "general"}
                                    className={`userSettingsTab${userSettingsTab === "general" ? " isActive" : ""}`}
                                    onClick={() => setUserSettingsTab("general")}
                                >
                                    General
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={userSettingsTab === "technical"}
                                    className={`userSettingsTab${userSettingsTab === "technical" ? " isActive" : ""}`}
                                    onClick={() => setUserSettingsTab("technical")}
                                >
                                    Technical
                                </button>
                            </div>
                            {userSettingsTab === "general" ? (
                                <>
                                    <h3>Output</h3>
                                    <label className="userSettingsField">
                                        <span className="userSettingsLabel">Texture Export</span>
                                        <select
                                            className="userSettingsSelect"
                                            value={settings.textureExportMode}
                                            onChange={(event) =>
                                                setSettings((current) => ({
                                                    ...current,
                                                    textureExportMode: event.target.value as typeof settings.textureExportMode,
                                                }))
                                            }
                                        >
                                            <option value="image">Image</option>
                                            <option value="glb-plane">GLB Plane</option>
                                        </select>
                                    </label>
                                    <p className="userSettingsHint">Output preferences are now managed here instead of the main optimization settings panel.</p>
                                </>
                            ) : (
                                <>
                                    <h3>Technical</h3>
                                    <label className="userSettingsField">
                                        <span className="userSettingsLabel">timeToWaitBeforeSuspend</span>
                                        <input
                                            className="userSettingsInput"
                                            type="number"
                                            value={settings.timeToWaitBeforeSuspend}
                                            step={100}
                                            min={0}
                                            onChange={(event) => {
                                                const nextValue = Number(event.target.value);
                                                setSettings((current) => ({
                                                    ...current,
                                                    timeToWaitBeforeSuspend: Math.max(0, nextValue),
                                                }));
                                            }}
                                        />
                                    </label>
                                    <p className="userSettingsHint">
                                        Compression handling is now available from the left header compression card.
                                    </p>
                                    {compressionConflictWarning ? <p className="userSettingsWarning">{compressionConflictWarning}</p> : null}
                                </>
                            )}
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

            <footer ref={footerRef} className={`footerBar${footerHidden ? " isHidden" : ""}`}>
                <div className="footerBrand">
                    <div className="brandTitle">GLB Optimizer v2</div>
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
        </div>
        </FluentProvider>
    );
}
