import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { DragEvent, MutableRefObject } from "react";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { DracoCompression } from "@babylonjs/core/Meshes/Compression/dracoCompression";
import { Engine } from "@babylonjs/core/Engines/engine";
import { FilesInput } from "@babylonjs/core/Misc/filesInput";
import { FramingBehavior } from "@babylonjs/core/Behaviors/Cameras/framingBehavior";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Layer } from "@babylonjs/core/Layers/layer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRBaseMaterial } from "@babylonjs/core/Materials/PBR/pbrBaseMaterial";
import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/core/Loading/loadingScreen";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import "@babylonjs/core/Helpers/sceneHelpers";
import "@babylonjs/loaders/glTF";
import "./ViewerCanvas.css";
import type { EnvironmentPreset } from "../app/environmentPresets";
import type { LoadedAssetInfo, LoadedAssetKind } from "../app/model";
import type { AnimationControlsState } from "./AnimationControls.types";
import { detectAssetFeaturesFromGlbBytes } from "../features/assetFeatures/detectAssetFeatures";
import { getBabylonDracoDecoderUrls } from "../features/draco/loadDracoDecoderModule";
import { captureActiveSceneComparison } from "../features/screenshotCompare/captureSceneComparison";
import type { ScreenshotCompareResult } from "../features/screenshotCompare/types";
import { createTexturePlaneGlb, isStandaloneTextureFile } from "../features/texture/texturePlaneAsset";

const OPTIMIZED_LAYER_MASK = 0x20000000;
const SOURCE_LAYER_MASK = 0x0fffffff;

function getDisplayName(file: File): string {
    const extended = file as File & { correctName?: string; webkitRelativePath?: string };
    return extended.correctName || extended.webkitRelativePath || file.name;
}

function getSceneFile(files: File[]): File | undefined {
    const preferredExtensions = [".gltf", ".glb"];
    return files.find((file) => preferredExtensions.some((extension) => getDisplayName(file).toLowerCase().endsWith(extension)));
}

function getStandaloneTextureFile(files: File[]): File | undefined {
    if (files.length !== 1) {
        return undefined;
    }

    return isStandaloneTextureFile(files[0]) ? files[0] : undefined;
}

function normalizeResourceUri(uri: string): string {
    return decodeURIComponent(uri).replace(/\\/g, "/").replace(/^\.\/+/, "").toLowerCase();
}

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    if (typeof error === "string" && error.trim()) {
        return error;
    }

    if (typeof error === "object" && error !== null) {
        const maybeMessage = "message" in error ? error.message : undefined;
        if (typeof maybeMessage === "string" && maybeMessage.trim()) {
            return maybeMessage;
        }

        try {
            const serialized = JSON.stringify(error);
            if (serialized && serialized !== "{}") {
                return serialized;
            }
        } catch {
            // Ignore serialization issues and fall back to the default message below.
        }
    }

    return fallback;
}

async function getMissingGltfResources(sceneFile: File, files: File[]): Promise<string[]> {
    if (!getDisplayName(sceneFile).toLowerCase().endsWith(".gltf")) {
        return [];
    }

    const json = JSON.parse(await sceneFile.text()) as {
        buffers?: Array<{ uri?: string }>;
        images?: Array<{ uri?: string }>;
    };
    const available = new Set<string>();

    for (const file of files) {
        const normalizedName = normalizeResourceUri(getDisplayName(file));
        available.add(normalizedName);
        const slashIndex = normalizedName.lastIndexOf("/");
        if (slashIndex !== -1) {
            available.add(normalizedName.slice(slashIndex + 1));
        }
    }

    const missing = new Set<string>();
    const resourceUris = [...(json.buffers ?? []), ...(json.images ?? [])]
        .map((entry) => entry.uri)
        .filter((uri): uri is string => Boolean(uri && !uri.startsWith("data:")));

    for (const uri of resourceUris) {
        const normalizedUri = normalizeResourceUri(uri);
        const slashIndex = normalizedUri.lastIndexOf("/");
        const baseName = slashIndex === -1 ? normalizedUri : normalizedUri.slice(slashIndex + 1);
        if (!available.has(normalizedUri) && !available.has(baseName)) {
            missing.add(uri);
        }
    }

    return Array.from(missing);
}

export interface ViewerSceneInfo {
    sourceLabel: string;
    message: string;
}

export interface ViewerDisposable {
    dispose: () => void;
}

interface InspectorTokenLike {
    isDisposed: boolean;
    dispose: () => void;
}

export interface ViewerCanvasHandle {
    loadFiles: (files: FileList | File[]) => Promise<void>;
    toggleInspector: () => Promise<void>;
    getLoadedAssetInfo: () => LoadedAssetInfo | null;
    compareScreenshots: () => Promise<ScreenshotCompareResult>;
    toggleAnimationPlayback: () => AnimationControlsState;
    setAnimationFrame: (frame: number) => AnimationControlsState;
    setActiveAnimationGroup: (groupIndex: number) => AnimationControlsState;
    suspendRendering: () => ViewerDisposable;
    markSceneMutated: () => void;
}

interface ViewerCanvasProps {
    environment: EnvironmentPreset;
    skyboxEnabled: boolean;
    wireframeEnabled: boolean;
    footerHidden: boolean;
    timeToWaitBeforeSuspend: number;
    optimizedAsset: { url: string; kind: LoadedAssetKind } | null;
    sourceSceneVersion: number;
    onSceneInfoChange: (info: ViewerSceneInfo) => void;
    onInspectorVisibilityChange?: (visible: boolean) => void;
    onAnimationStateChange?: (state: AnimationControlsState) => void;
    onSourceAssetLoaded?: (asset: LoadedAssetInfo, reason: "load" | "reload") => void | Promise<void>;
}

export const ViewerCanvas = forwardRef<ViewerCanvasHandle, ViewerCanvasProps>(function ViewerCanvas(props, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const inspectorHostRef = useRef<HTMLDivElement | null>(null);
    const engineRef = useRef<Engine | null>(null);
    const sceneRef = useRef<Scene | null>(null);
    const loadedAssetRef = useRef<LoadedAssetInfo | null>(null);
    const pendingFilesRef = useRef<File[]>([]);
    const optimizedMeshesRef = useRef<AbstractMesh[]>([]);
    const sourceSkyboxRef = useRef<Mesh | null>(null);
    const optimizedSkyboxRef = useRef<Mesh | null>(null);
    const environmentPathRef = useRef<string | null>(null);
    const secondaryCameraRef = useRef<ArcRotateCamera | null>(null);
    const compareOverlayRef = useRef<Layer | null>(null);
    const inspectorTokenRef = useRef<InspectorTokenLike | null>(null);
    const animationObserverRef = useRef<ReturnType<Scene["onBeforeRenderObservable"]["add"]> | null>(null);
    const animationStateRef = useRef<AnimationControlsState>(createEmptyAnimationState());
    const renderLoopRef = useRef<(() => void) | null>(null);
    const renderLoopControllerRef = useRef<ViewerDisposable | null>(null);
    const suspendRenderCountRef = useRef(0);
    const sceneMutatedRef = useRef(true);
    const renderedReadyFrameRef = useRef(false);
    const lastRenderActivityAtRef = useRef(Date.now());
    const [isDragActive, setIsDragActive] = useState(false);
    const [isInspectorVisible, setIsInspectorVisible] = useState(false);

    const cameraHasMotion = (scene: Scene) =>
        scene.activeCameras?.some((camera) => {
            if (!(camera instanceof ArcRotateCamera)) {
                return false;
            }

            return (
                Math.abs(camera.inertialAlphaOffset) > 0.0001 ||
                Math.abs(camera.inertialBetaOffset) > 0.0001 ||
                Math.abs(camera.inertialRadiusOffset) > 0.0001 ||
                Math.abs(camera.inertialPanningX) > 0.0001 ||
                Math.abs(camera.inertialPanningY) > 0.0001
            );
        }) === true;

    const shouldRenderScene = (scene: Scene) =>
        sceneMutatedRef.current ||
        isInspectorVisible ||
        cameraHasMotion(scene) ||
        scene.animationGroups.some((group) => group.isPlaying) ||
        Boolean(compareOverlayRef.current);

    const stopRendering = () => {
        const engine = engineRef.current;
        const renderLoop = renderLoopRef.current;
        if (!engine || !renderLoop || !renderLoopControllerRef.current) {
            return;
        }

        engine.stopRenderLoop(renderLoop);
        renderLoopRef.current = null;
        renderLoopControllerRef.current = null;
        renderedReadyFrameRef.current = false;
    };

    const beginRendering = () => {
        const engine = engineRef.current;
        if (!engine || renderLoopControllerRef.current || suspendRenderCountRef.current > 0) {
            return;
        }

        const renderLoop = () => {
            const scene = sceneRef.current;
            if (!scene) {
                stopRendering();
                return;
            }

            let shouldRender = shouldRenderScene(scene);
            if (!shouldRender && !renderedReadyFrameRef.current) {
                renderedReadyFrameRef.current = scene.isReady(true);
                shouldRender = true;
            }

            if (!shouldRender) {
                const now = Date.now();
                if (now - lastRenderActivityAtRef.current >= props.timeToWaitBeforeSuspend) {
                    stopRendering();
                    return;
                }
            } else {
                lastRenderActivityAtRef.current = Date.now();
            }

            sceneMutatedRef.current = false;
            scene.render();
            renderedReadyFrameRef.current = true;
        };

        renderLoopRef.current = renderLoop;
        renderLoopControllerRef.current = {
            dispose: () => {
                stopRendering();
            },
        };
        engine.runRenderLoop(renderLoop);
    };

    const markSceneMutated = () => {
        sceneMutatedRef.current = true;
        renderedReadyFrameRef.current = false;
        lastRenderActivityAtRef.current = Date.now();
        beginRendering();
    };

    const loadIntoViewer = async (files: File[], dataTransferItems: DataTransferItemList | null, reason: "load" | "reload") => {
        await loadFilesIntoViewer(files, {
            dataTransferItems,
            engineRef,
            sceneRef,
            canvasRef,
            loadedAssetRef,
            pendingFilesRef,
            optimizedMeshesRef,
            sourceSkyboxRef,
            optimizedSkyboxRef,
            environmentPathRef,
            secondaryCameraRef,
            compareOverlayRef,
            animationObserverRef,
            animationStateRef,
            environment: props.environment,
            skyboxEnabled: props.skyboxEnabled,
            wireframeEnabled: props.wireframeEnabled,
            loadReason: reason,
            onSceneInfoChange: props.onSceneInfoChange,
            onAnimationStateChange: props.onAnimationStateChange,
            onSourceAssetLoaded: props.onSourceAssetLoaded,
            onSceneMutated: markSceneMutated,
        });
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }

        DracoCompression.Configuration = {
            decoder: getBabylonDracoDecoderUrls(),
        };

        const engine = new Engine(canvas, true, {
            preserveDrawingBuffer: true,
            stencil: true,
        });
        engineRef.current = engine;

        const scene = createPreviewScene(engine, canvas);
        sceneRef.current = scene;
        setupSplitView(scene, canvas, secondaryCameraRef);
        applyEnvironment(scene, props.environment, props.skyboxEnabled, sourceSkyboxRef, optimizedSkyboxRef, environmentPathRef);
        applyWireframe(scene, props.wireframeEnabled);
        props.onSceneInfoChange({
            sourceLabel: "Preview Scene",
            message: "Drag files onto the canvas or use Open to load a scene.",
        });
        markSceneMutated();

        const handleResize = () => engine.resize();
        const resizeObserver = new ResizeObserver(() => {
            engine.resize();
            markSceneMutated();
        });
        resizeObserver.observe(canvas);
        window.addEventListener("resize", handleResize);

        const handleCanvasInteraction = () => {
            markSceneMutated();
        };
        canvas.addEventListener("pointerdown", handleCanvasInteraction);
        canvas.addEventListener("pointermove", handleCanvasInteraction);
        canvas.addEventListener("wheel", handleCanvasInteraction, { passive: true });
        canvas.addEventListener("touchstart", handleCanvasInteraction, { passive: true });
        canvas.addEventListener("touchmove", handleCanvasInteraction, { passive: true });

        return () => {
            inspectorTokenRef.current?.dispose();
            inspectorTokenRef.current = null;
            setIsInspectorVisible(false);
            props.onInspectorVisibilityChange?.(false);
            stopRendering();
            resizeObserver.disconnect();
            window.removeEventListener("resize", handleResize);
            canvas.removeEventListener("pointerdown", handleCanvasInteraction);
            canvas.removeEventListener("pointermove", handleCanvasInteraction);
            canvas.removeEventListener("wheel", handleCanvasInteraction);
            canvas.removeEventListener("touchstart", handleCanvasInteraction);
            canvas.removeEventListener("touchmove", handleCanvasInteraction);
            if (compareOverlayRef.current) {
                compareOverlayRef.current.dispose();
                compareOverlayRef.current = null;
            }
            detachAnimationObserver(sceneRef.current, animationObserverRef);
            sceneRef.current?.dispose();
            sceneRef.current = null;
            engineRef.current = null;
            engine.dispose();
        };
    }, []);

    useEffect(() => {
        const preventWindowDrop = (event: globalThis.DragEvent) => {
            event.preventDefault();
        };

        window.addEventListener("dragover", preventWindowDrop);
        window.addEventListener("drop", preventWindowDrop);

        return () => {
            window.removeEventListener("dragover", preventWindowDrop);
            window.removeEventListener("drop", preventWindowDrop);
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

            if (event.code !== "KeyR") {
                return;
            }

            const files = loadedAssetRef.current?.files ?? pendingFilesRef.current;
            if (!files.length) {
                return;
            }

            event.preventDefault();
            void loadIntoViewer(files, null, "reload");
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [props.environment, props.onSceneInfoChange, props.onSourceAssetLoaded, props.optimizedAsset, props.skyboxEnabled, props.wireframeEnabled]);

    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) {
            return;
        }

        applyEnvironment(scene, props.environment, props.skyboxEnabled, sourceSkyboxRef, optimizedSkyboxRef, environmentPathRef);
        markSceneMutated();
    }, [props.environment, props.skyboxEnabled]);

    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) {
            return;
        }

        applyWireframe(scene, props.wireframeEnabled);
        markSceneMutated();
    }, [props.wireframeEnabled]);

    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) {
            return;
        }

        void syncOptimizedAsset(scene, props.optimizedAsset, optimizedMeshesRef, props.onSceneInfoChange, markSceneMutated);
    }, [props.optimizedAsset, props.sourceSceneVersion, props.onSceneInfoChange]);

    useImperativeHandle(
        ref,
        () => ({
            loadFiles: async (inputFiles) => {
                const files = Array.from(inputFiles);
                if (!files.length) {
                    return;
                }

                await loadIntoViewer(files, null, "load");
            },
            toggleInspector: async () => {
                const scene = sceneRef.current;
                if (!scene) {
                    return;
                }

                const inspectorModule = await import("@babylonjs/inspector");
                if (inspectorTokenRef.current && !inspectorTokenRef.current.isDisposed) {
                    inspectorTokenRef.current.dispose();
                    inspectorTokenRef.current = null;
                    setIsInspectorVisible(false);
                    props.onInspectorVisibilityChange?.(false);
                    markSceneMutated();
                    props.onSceneInfoChange({
                        sourceLabel: "Inspector",
                        message: "Inspector hidden.",
                    });
                } else {
                    inspectorTokenRef.current = inspectorModule.ShowInspector(scene, {
                        containerElement: inspectorHostRef.current ?? undefined,
                        layoutMode: "overlay",
                        themeMode: "dark",
                        showThemeSelector: false,
                    });
                    setIsInspectorVisible(true);
                    props.onInspectorVisibilityChange?.(true);
                    markSceneMutated();
                    props.onSceneInfoChange({
                        sourceLabel: "Inspector",
                        message: "Inspector shown for the current scene.",
                    });
                }
            },
            getLoadedAssetInfo: () => loadedAssetRef.current,
            compareScreenshots: async () => {
                const scene = sceneRef.current;
                if (!scene) {
                    throw new Error("No scene is available for screenshot comparison.");
                }

                const result = await captureActiveSceneComparison(scene);
                showCompareOverlay(scene, result.diffDataUrl, compareOverlayRef);
                markSceneMutated();
                return result;
            },
            toggleAnimationPlayback: () => {
                const scene = sceneRef.current;
                if (!scene) {
                    return createEmptyAnimationState();
                }

                const nextState = togglePrimaryAnimationPlayback(scene);
                markSceneMutated();
                props.onAnimationStateChange?.(nextState);
                return nextState;
            },
            setAnimationFrame: (frame: number) => {
                const scene = sceneRef.current;
                if (!scene) {
                    return createEmptyAnimationState();
                }

                const nextState = setPrimaryAnimationFrame(scene, frame);
                markSceneMutated();
                props.onAnimationStateChange?.(nextState);
                return nextState;
            },
            setActiveAnimationGroup: (groupIndex: number) => {
                const scene = sceneRef.current;
                if (!scene) {
                    return createEmptyAnimationState();
                }

                const nextState = setActiveAnimationGroup(scene, groupIndex);
                markSceneMutated();
                props.onAnimationStateChange?.(nextState);
                return nextState;
            },
            suspendRendering: () => {
                stopRendering();
                suspendRenderCountRef.current += 1;
                let disposed = false;
                return {
                    dispose: () => {
                        if (disposed) {
                            return;
                        }

                        disposed = true;
                        suspendRenderCountRef.current = Math.max(0, suspendRenderCountRef.current - 1);
                        if (suspendRenderCountRef.current === 0) {
                            beginRendering();
                        }
                    },
                };
            },
            markSceneMutated,
        }),
        [props.environment, props.onAnimationStateChange, props.onSceneInfoChange, props.onSourceAssetLoaded, props.optimizedAsset, props.skyboxEnabled, props.wireframeEnabled]
    );

    const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDragActive(false);
        if (event.dataTransfer.files.length) {
            await loadIntoViewer(Array.from(event.dataTransfer.files), event.dataTransfer.items, "load");
        }
    };

    return (
        <div
            className={"viewerCanvasRoot" + (isDragActive ? " isDragActive" : "")}
            onDragEnter={(event) => {
                event.preventDefault();
                setIsDragActive(true);
            }}
            onDragOver={(event) => {
                event.preventDefault();
                if (!isDragActive) {
                    setIsDragActive(true);
                }
            }}
            onDragLeave={(event) => {
                event.preventDefault();
                if (event.currentTarget === event.target) {
                    setIsDragActive(false);
                }
            }}
            onDrop={handleDrop}
        >
            <canvas ref={canvasRef} className="viewerCanvas" />
            <div
                ref={inspectorHostRef}
                className={`viewerInspectorHost${isInspectorVisible ? " isVisible" : ""}${props.footerHidden ? " isExpanded" : ""}`}
            />
            <div className="viewerSplitLabels">
                <span>Source</span>
                <span>Optimized</span>
            </div>
            <div className="viewerOverlay">
                <span>Drop `.glb`, `.gltf`, or a texture here</span>
            </div>
        </div>
    );
});

function createPreviewScene(engine: Engine, canvas: HTMLCanvasElement): Scene {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.06, 0.11, 0.2, 1);

    const camera = new ArcRotateCamera("camera", -Math.PI / 2, 1.15, 7, Vector3.Zero(), scene);
    camera.attachControl(canvas, true);
    camera.wheelDeltaPercentage = 0.01;
    camera.pinchDeltaPercentage = 0.01;

    new HemisphericLight("light", new Vector3(0.5, 1, 0.2), scene);

    return scene;
}

function setupSplitView(scene: Scene, canvas: HTMLCanvasElement, secondaryCameraRef: MutableRefObject<ArcRotateCamera | null>) {
    if (!scene.activeCamera) {
        scene.createDefaultCamera(true);
    }

    const primaryCamera = scene.activeCamera as ArcRotateCamera;
    primaryCamera.attachControl(canvas, true);
    primaryCamera.viewport = new Viewport(0, 0, 0.5, 1);
    primaryCamera.layerMask = SOURCE_LAYER_MASK;

    const secondaryCamera = primaryCamera.clone("optimized-camera") as ArcRotateCamera;
    secondaryCamera.viewport = new Viewport(0.5, 0, 0.5, 1);
    secondaryCamera.layerMask = OPTIMIZED_LAYER_MASK;
    secondaryCamera.attachControl(canvas, false);

    scene.activeCameras = [primaryCamera, secondaryCamera];
    secondaryCameraRef.current = secondaryCamera;

    scene.onBeforeCameraRenderObservable.add(() => {
        secondaryCamera.alpha = primaryCamera.alpha;
        secondaryCamera.beta = primaryCamera.beta;
        secondaryCamera.radius = primaryCamera.radius;
        secondaryCamera.target.copyFrom(primaryCamera.target);
    });
}

function applyWireframe(scene: Scene, enabled: boolean) {
    scene.forceWireframe = enabled;
}

function applyEnvironment(
    scene: Scene,
    environment: EnvironmentPreset,
    skyboxEnabled: boolean,
    sourceSkyboxRef: MutableRefObject<Mesh | null>,
    optimizedSkyboxRef: MutableRefObject<Mesh | null>,
    environmentPathRef: MutableRefObject<string | null>
) {
    if (optimizedSkyboxRef.current) {
        optimizedSkyboxRef.current.dispose(false, true);
        optimizedSkyboxRef.current = null;
    }

    if (sourceSkyboxRef.current) {
        sourceSkyboxRef.current.dispose(false, true);
        sourceSkyboxRef.current = null;
    }

    if (scene.environmentTexture && environmentPathRef.current !== environment.path) {
        scene.environmentTexture.dispose();
        scene.environmentTexture = null;
    }

    if (!scene.environmentTexture || environmentPathRef.current !== environment.path) {
        scene.environmentTexture = CubeTexture.CreateFromPrefilteredData(environment.path, scene);
        environmentPathRef.current = environment.path;
    }

    if (skyboxEnabled && scene.environmentTexture) {
        const skybox = scene.createDefaultSkybox(scene.environmentTexture, true, 1000, 0.25, false);
        if (skybox) {
            skybox.layerMask = SOURCE_LAYER_MASK;
            sourceSkyboxRef.current = skybox;

            const optimizedSkybox = skybox.clone("optimized-skybox") as Mesh | null;
            if (optimizedSkybox) {
                optimizedSkybox.layerMask = OPTIMIZED_LAYER_MASK;
                optimizedSkyboxRef.current = optimizedSkybox;
            }
        }
    }
}

async function syncOptimizedAsset(
    scene: Scene,
    optimizedAsset: { url: string; kind: LoadedAssetKind } | null,
    optimizedMeshesRef: MutableRefObject<AbstractMesh[]>,
    onSceneInfoChange: (info: ViewerSceneInfo) => void,
    onSceneMutated: () => void
) {
    for (const mesh of optimizedMeshesRef.current) {
        mesh.dispose(false, true);
    }
    optimizedMeshesRef.current = [];

    if (!optimizedAsset) {
        return;
    }

    try {
        const optimizedAssetUrl = optimizedAsset.url;
        const optimizedBytes = new Uint8Array(await (await fetch(optimizedAssetUrl)).arrayBuffer());
        const features = await detectAssetFeaturesFromGlbBytes(optimizedBytes);
        if (features.hasDraco) {
            await DracoCompression.Default.whenReadyAsync();
        }

        const importResult = await SceneLoader.ImportMeshAsync("", "", optimizedAssetUrl, scene, undefined, ".glb");
        for (const mesh of importResult.meshes) {
            mesh.layerMask = OPTIMIZED_LAYER_MASK;
        }
        optimizedMeshesRef.current = importResult.meshes;
        onSceneMutated();
    } catch (error) {
        onSceneInfoChange({
            sourceLabel: "Optimized Preview Error",
            message: `Optimized preview failed: ${getErrorMessage(error, "Unknown preview error")}`,
        });
    }
}

async function createStandaloneTextureScene(
    engine: Engine,
    canvas: HTMLCanvasElement,
    textureFile: File,
    secondaryCameraRef: MutableRefObject<ArcRotateCamera | null>
): Promise<Scene> {
    const glbBytes = await createTexturePlaneGlb(textureFile);
    const objectUrl = URL.createObjectURL(new Blob([glbBytes], { type: "model/gltf-binary" }));
    try {
        const scene = await SceneLoader.LoadAsync("", objectUrl, engine, undefined, ".glb");
        prepareScene(scene, canvas, textureFile.name, secondaryCameraRef);
        applySourceLayerMask(scene);
        return scene;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

function applySourceLayerMask(scene: Scene) {
    for (const mesh of scene.meshes) {
        if (mesh.layerMask !== OPTIMIZED_LAYER_MASK) {
            mesh.layerMask = SOURCE_LAYER_MASK;
        }
    }
}

function createEmptyAnimationState(): AnimationControlsState {
    return {
        hasAnimations: false,
        isPlaying: false,
        currentFrame: 0,
        fromFrame: 0,
        toFrame: 0,
        groupIndex: 0,
        groupNames: [],
    };
}

function getActiveAnimationGroupIndex(scene: Scene): number {
    const playingGroupIndex = scene.animationGroups.findIndex((group) => group.isPlaying);
    return playingGroupIndex >= 0 ? playingGroupIndex : 0;
}

function getCurrentFrameForGroup(group: Scene["animationGroups"][number]): number {
    const runtimeAnimations = group.targetedAnimations[0]?.animation.runtimeAnimations;
    if (runtimeAnimations?.length) {
        return runtimeAnimations[0].currentFrame;
    }

    return group.from;
}

function getAnimationState(scene: Scene): AnimationControlsState {
    if (!scene.animationGroups.length) {
        return createEmptyAnimationState();
    }

    const groupIndex = getActiveAnimationGroupIndex(scene);
    const activeGroup = scene.animationGroups[groupIndex];
    return {
        hasAnimations: true,
        isPlaying: Boolean(activeGroup?.isPlaying),
        currentFrame: activeGroup ? getCurrentFrameForGroup(activeGroup) : 0,
        fromFrame: activeGroup?.from ?? 0,
        toFrame: activeGroup?.to ?? 0,
        groupIndex,
        groupNames: scene.animationGroups.map((group) => group.name),
    };
}

function emitAnimationState(scene: Scene, animationStateRef: MutableRefObject<AnimationControlsState>, onAnimationStateChange?: (state: AnimationControlsState) => void) {
    const nextState = getAnimationState(scene);
    const previousState = animationStateRef.current;

    if (
        previousState.hasAnimations === nextState.hasAnimations &&
        previousState.isPlaying === nextState.isPlaying &&
        previousState.groupIndex === nextState.groupIndex &&
        previousState.fromFrame === nextState.fromFrame &&
        previousState.toFrame === nextState.toFrame &&
        previousState.groupNames.length === nextState.groupNames.length &&
        previousState.groupNames.every((name, index) => name === nextState.groupNames[index]) &&
        Math.abs(previousState.currentFrame - nextState.currentFrame) < 0.01
    ) {
        return previousState;
    }

    animationStateRef.current = nextState;
    onAnimationStateChange?.(nextState);
    return nextState;
}

function detachAnimationObserver(scene: Scene | null, animationObserverRef: MutableRefObject<ReturnType<Scene["onBeforeRenderObservable"]["add"]> | null>) {
    if (scene && animationObserverRef.current) {
        scene.onBeforeRenderObservable.remove(animationObserverRef.current);
    }
    animationObserverRef.current = null;
}

function attachAnimationObserver(
    scene: Scene,
    animationObserverRef: MutableRefObject<ReturnType<Scene["onBeforeRenderObservable"]["add"]> | null>,
    animationStateRef: MutableRefObject<AnimationControlsState>,
    onAnimationStateChange?: (state: AnimationControlsState) => void
) {
    detachAnimationObserver(scene, animationObserverRef);
    animationObserverRef.current = scene.onBeforeRenderObservable.add(() => {
        emitAnimationState(scene, animationStateRef, onAnimationStateChange);
    });
    emitAnimationState(scene, animationStateRef, onAnimationStateChange);
}

function togglePrimaryAnimationPlayback(scene: Scene): AnimationControlsState {
    const animationState = getAnimationState(scene);
    if (!animationState.hasAnimations) {
        return animationState;
    }

    const activeGroup = scene.animationGroups[animationState.groupIndex];
    if (!activeGroup) {
        return createEmptyAnimationState();
    }

    if (activeGroup.isPlaying) {
        activeGroup.pause();
        return getAnimationState(scene);
    }

    activeGroup.play(true);
    return getAnimationState(scene);
}

function setPrimaryAnimationFrame(scene: Scene, frame: number): AnimationControlsState {
    const animationState = getAnimationState(scene);
    if (!animationState.hasAnimations) {
        return animationState;
    }

    const activeGroup = scene.animationGroups[animationState.groupIndex];
    if (!activeGroup) {
        return createEmptyAnimationState();
    }

    if (!activeGroup.isPlaying) {
        activeGroup.play(true);
        activeGroup.goToFrame(frame);
        activeGroup.pause();
        return getAnimationState(scene);
    }

    activeGroup.goToFrame(frame);
    return getAnimationState(scene);
}

function setActiveAnimationGroup(scene: Scene, groupIndex: number): AnimationControlsState {
    if (!scene.animationGroups.length) {
        return createEmptyAnimationState();
    }

    const nextIndex = Math.max(0, Math.min(groupIndex, scene.animationGroups.length - 1));
    const currentIndex = getActiveAnimationGroupIndex(scene);
    if (currentIndex !== nextIndex) {
        const currentGroup = scene.animationGroups[currentIndex];
        currentGroup?.stop();
    }

    const nextGroup = scene.animationGroups[nextIndex];
    nextGroup.play(true);
    return getAnimationState(scene);
}

async function loadFilesIntoViewer(
    files: File[],
    context: {
        dataTransferItems: DataTransferItemList | null;
        engineRef: MutableRefObject<Engine | null>;
        sceneRef: MutableRefObject<Scene | null>;
        canvasRef: MutableRefObject<HTMLCanvasElement | null>;
        loadedAssetRef: MutableRefObject<LoadedAssetInfo | null>;
        pendingFilesRef: MutableRefObject<File[]>;
        optimizedMeshesRef: MutableRefObject<AbstractMesh[]>;
        sourceSkyboxRef: MutableRefObject<Mesh | null>;
        optimizedSkyboxRef: MutableRefObject<Mesh | null>;
        environmentPathRef: MutableRefObject<string | null>;
        secondaryCameraRef: MutableRefObject<ArcRotateCamera | null>;
        compareOverlayRef: MutableRefObject<Layer | null>;
        animationObserverRef: MutableRefObject<ReturnType<Scene["onBeforeRenderObservable"]["add"]> | null>;
        animationStateRef: MutableRefObject<AnimationControlsState>;
        environment: EnvironmentPreset;
        skyboxEnabled: boolean;
        wireframeEnabled: boolean;
        loadReason: "load" | "reload";
        onSceneInfoChange: (info: ViewerSceneInfo) => void;
        onAnimationStateChange?: (state: AnimationControlsState) => void;
        onSourceAssetLoaded?: (asset: LoadedAssetInfo, reason: "load" | "reload") => void | Promise<void>;
        onSceneMutated: () => void;
    }
) {
    const engine = context.engineRef.current;
    const canvas = context.canvasRef.current;
    if (!engine || !canvas) {
        return;
    }

    const incomingFiles = files.map((file) => {
        const extended = file as File & { correctName?: string };
        extended.correctName = getDisplayName(file);
        return extended;
    });
    const incomingSceneFile = getSceneFile(incomingFiles);
    const incomingTextureFile = getStandaloneTextureFile(incomingFiles);
    const shouldReplacePendingFiles = context.loadReason === "reload" || Boolean(incomingSceneFile || incomingTextureFile);

    const candidateFiles = shouldReplacePendingFiles
        ? incomingFiles
        : (() => {
              const mergedFilesByName = new Map<string, File>();
              for (const file of context.pendingFilesRef.current) {
                  mergedFilesByName.set(getDisplayName(file).toLowerCase(), file);
              }
              for (const file of incomingFiles) {
                  mergedFilesByName.set(getDisplayName(file).toLowerCase(), file);
              }
              return Array.from(mergedFilesByName.values());
          })();

    const namedFiles = candidateFiles.map((file) => {
        const extended = file as File & { correctName?: string };
        extended.correctName = getDisplayName(file);
        return extended;
    });

    const sceneFile = getSceneFile(namedFiles);
    const textureFile = getStandaloneTextureFile(namedFiles);
    const firstFile = incomingFiles[0] ?? namedFiles[0];
    context.onSceneInfoChange({
        sourceLabel: sceneFile ? getDisplayName(sceneFile) : getDisplayName(textureFile ?? firstFile),
        message: `Loading ${namedFiles.length} file${namedFiles.length === 1 ? "" : "s"}...`,
    });

    try {
        engine.clearInternalTexturesCache();
        const previousScene = context.sceneRef.current;
        if (context.compareOverlayRef.current) {
            context.compareOverlayRef.current.dispose();
            context.compareOverlayRef.current = null;
        }
        detachAnimationObserver(previousScene, context.animationObserverRef);

        if (!sceneFile && !textureFile) {
            context.pendingFilesRef.current = namedFiles;
            throw new Error("No supported source file found. Upload a `.glb`, a `.gltf`, or a standalone PNG/JPG/WEBP texture.");
        }

        if (sceneFile) {
            const missingResources = await getMissingGltfResources(sceneFile, namedFiles);
            if (missingResources.length > 0) {
                context.pendingFilesRef.current = namedFiles;
                throw new Error(`Missing sidecar files for ${getDisplayName(sceneFile)}: ${missingResources.join(", ")}. Add those files and try again.`);
            }
        }

        const nextScene = sceneFile
            ? await loadSceneWithFilesInput(engine, namedFiles, context.dataTransferItems, sceneFile)
            : await createStandaloneTextureScene(engine, canvas, textureFile as File, context.secondaryCameraRef);
        const loadedAsset: LoadedAssetInfo = {
            kind: sceneFile ? "scene" : "texture",
            primaryFileName: getDisplayName(sceneFile ?? (textureFile as File)),
            files: namedFiles,
        };
        context.loadedAssetRef.current = loadedAsset;
        context.pendingFilesRef.current = namedFiles;

        if (previousScene && previousScene !== nextScene) {
            previousScene.dispose();
        }

        context.sceneRef.current = nextScene;
        if (sceneFile) {
            prepareScene(nextScene, canvas, getDisplayName(sceneFile), context.secondaryCameraRef);
            applySourceLayerMask(nextScene);
        }
        context.environmentPathRef.current = null;
        applyEnvironment(nextScene, context.environment, context.skyboxEnabled, context.sourceSkyboxRef, context.optimizedSkyboxRef, context.environmentPathRef);
        applyWireframe(nextScene, context.wireframeEnabled);
        await context.onSourceAssetLoaded?.(loadedAsset, context.loadReason);
        attachAnimationObserver(nextScene, context.animationObserverRef, context.animationStateRef, context.onAnimationStateChange);
        context.onSceneMutated();

        context.onSceneInfoChange({
            sourceLabel: getDisplayName(sceneFile ?? (textureFile as File)),
            message: sceneFile
                ? "Scene loaded. Single-canvas compare mode is active with split viewports."
                : "Texture loaded onto a preview plane. Optimization will reuse the same scene pipeline as any other imported asset.",
        });
    } catch (error) {
        const message = getErrorMessage(error, "Unknown loading error");
        context.animationStateRef.current = createEmptyAnimationState();
        context.onAnimationStateChange?.(context.animationStateRef.current);
        context.onSceneInfoChange({
            sourceLabel: "Load Error",
            message: `Load error: ${message}`,
        });
    }
}

async function loadSceneWithFilesInput(engine: Engine, files: File[], _dataTransferItems: DataTransferItemList | null, fallbackSceneFile: File): Promise<Scene> {
    const filesInput = new FilesInput(engine, null, null, null, null, null, null, null, null, false, true);

    const loadPromise = new Promise<Scene>((resolve, reject) => {
        filesInput.loadAsync = async (sceneFile) => {
            try {
                const scene = await SceneLoader.LoadAsync("file:", sceneFile ?? fallbackSceneFile, engine);
                resolve(scene);
                return scene;
            } catch (error) {
                reject(error);
                throw error;
            }
        };
    });

    filesInput.loadFiles({
        target: { files },
    });

    return loadPromise.finally(() => {
        filesInput.dispose();
    });
}

function prepareScene(scene: Scene, canvas: HTMLCanvasElement, sourceName: string, secondaryCameraRef: MutableRefObject<ArcRotateCamera | null>) {
    scene.clearColor = new Color4(0.06, 0.11, 0.2, 1);

    if (!scene.activeCamera) {
        scene.createDefaultCamera(true);
    }

    const activeCamera = scene.activeCamera as ArcRotateCamera | null;
    if (activeCamera) {
        if (sourceName.toLowerCase().endsWith(".gltf") || sourceName.toLowerCase().endsWith(".glb")) {
            activeCamera.alpha += Math.PI;
        }

        activeCamera.attachControl(canvas, true);
        activeCamera.useFramingBehavior = true;
        activeCamera.wheelDeltaPercentage = 0.01;
        activeCamera.pinchDeltaPercentage = 0.01;

        const framingBehavior = activeCamera.getBehaviorByName("Framing") as FramingBehavior | null;
        if (framingBehavior && scene.meshes.length) {
            framingBehavior.framingTime = 0;
            framingBehavior.elevationReturnTime = -1;
            const worldExtends = scene.getWorldExtends((mesh) => mesh.isVisible && mesh.isEnabled());
            framingBehavior.zoomOnBoundingInfo(worldExtends.min, worldExtends.max);
        }

        setupSplitView(scene, canvas, secondaryCameraRef);
    }

    let hasPbr = false;
    for (const material of scene.materials) {
        if (material instanceof PBRBaseMaterial) {
            hasPbr = true;
            break;
        }
    }

    if (!hasPbr && !scene.lights.length) {
        scene.createDefaultLight();
    }
}

function showCompareOverlay(scene: Scene, diffDataUrl: string, compareOverlayRef: MutableRefObject<Layer | null>) {
    if (compareOverlayRef.current) {
        compareOverlayRef.current.dispose();
        compareOverlayRef.current = null;
    }

    const overlay = new Layer("compare-overlay", diffDataUrl, scene, false);
    overlay.layerMask = OPTIMIZED_LAYER_MASK;
    compareOverlayRef.current = overlay;

    scene.onPointerObservable.addOnce(() => {
        setTimeout(() => {
            if (compareOverlayRef.current === overlay) {
                compareOverlayRef.current.dispose();
                compareOverlayRef.current = null;
            } else {
                overlay.dispose();
            }
            scene.render();
        }, 3000);
    });
}
