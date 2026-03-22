import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { DragEvent, MutableRefObject } from "react";
import {
    AbstractMesh,
    ArcRotateCamera,
    Color4,
    CubeTexture,
    DracoCompression,
    Engine,
    FilesInput,
    FramingBehavior,
    HemisphericLight,
    Layer,
    Mesh,
    PBRBaseMaterial,
    Scene,
    SceneLoader,
    Vector3,
    Viewport,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import "./ViewerCanvas.css";
import type { EnvironmentPreset } from "../app/environmentPresets";
import type { LoadedAssetInfo } from "../app/model";
import type { AnimationControlsState } from "./AnimationControls.types";
import { detectAssetFeaturesFromGlbBytes } from "../features/assetFeatures/detectAssetFeatures";
import { getBabylonDracoDecoderUrls } from "../features/draco/loadDracoDecoderModule";
import { captureActiveSceneComparison } from "../features/screenshotCompare/captureSceneComparison";
import type { ScreenshotCompareResult } from "../features/screenshotCompare/types";

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

function normalizeResourceUri(uri: string): string {
    return decodeURIComponent(uri).replace(/\\/g, "/").replace(/^\.\/+/, "").toLowerCase();
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

export interface ViewerCanvasHandle {
    loadFiles: (files: FileList | File[]) => Promise<void>;
    toggleInspector: () => Promise<void>;
    getLoadedAssetInfo: () => LoadedAssetInfo | null;
    compareScreenshots: () => Promise<ScreenshotCompareResult>;
    toggleAnimationPlayback: () => AnimationControlsState;
    setAnimationFrame: (frame: number) => AnimationControlsState;
    setActiveAnimationGroup: (groupIndex: number) => AnimationControlsState;
}

interface ViewerCanvasProps {
    environment: EnvironmentPreset;
    skyboxEnabled: boolean;
    wireframeEnabled: boolean;
    optimizedAssetUrl: string | null;
    sourceSceneVersion: number;
    onSceneInfoChange: (info: ViewerSceneInfo) => void;
    onAnimationStateChange?: (state: AnimationControlsState) => void;
    onSourceAssetLoaded?: (asset: LoadedAssetInfo, reason: "load" | "reload") => void | Promise<void>;
}

export const ViewerCanvas = forwardRef<ViewerCanvasHandle, ViewerCanvasProps>(function ViewerCanvas(props, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
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
    const animationObserverRef = useRef<ReturnType<Scene["onBeforeRenderObservable"]["add"]> | null>(null);
    const animationStateRef = useRef<AnimationControlsState>(createEmptyAnimationState());
    const [isDragActive, setIsDragActive] = useState(false);

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
            optimizedAssetUrl: props.optimizedAssetUrl,
            loadReason: reason,
            onSceneInfoChange: props.onSceneInfoChange,
            onAnimationStateChange: props.onAnimationStateChange,
            onSourceAssetLoaded: props.onSourceAssetLoaded,
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

        const renderLoop = () => {
            sceneRef.current?.render();
        };
        engine.runRenderLoop(renderLoop);

        const handleResize = () => engine.resize();
        const resizeObserver = new ResizeObserver(() => {
            engine.resize();
        });
        resizeObserver.observe(canvas);
        window.addEventListener("resize", handleResize);

        return () => {
            engine.stopRenderLoop(renderLoop);
            resizeObserver.disconnect();
            window.removeEventListener("resize", handleResize);
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
    }, [props.environment, props.onSceneInfoChange, props.onSourceAssetLoaded, props.optimizedAssetUrl, props.skyboxEnabled, props.wireframeEnabled]);

    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) {
            return;
        }

        applyEnvironment(scene, props.environment, props.skyboxEnabled, sourceSkyboxRef, optimizedSkyboxRef, environmentPathRef);
    }, [props.environment, props.skyboxEnabled]);

    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) {
            return;
        }

        applyWireframe(scene, props.wireframeEnabled);
    }, [props.wireframeEnabled]);

    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) {
            return;
        }

        void syncOptimizedAsset(scene, props.optimizedAssetUrl, optimizedMeshesRef, props.onSceneInfoChange);
    }, [props.optimizedAssetUrl, props.sourceSceneVersion, props.onSceneInfoChange]);

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

                await import("@babylonjs/inspector");
                if (scene.debugLayer.isVisible()) {
                    scene.debugLayer.hide();
                    props.onSceneInfoChange({
                        sourceLabel: "Inspector",
                        message: "Inspector hidden.",
                    });
                } else {
                    await scene.debugLayer.show({ embedMode: true });
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
                return result;
            },
            toggleAnimationPlayback: () => {
                const scene = sceneRef.current;
                if (!scene) {
                    return createEmptyAnimationState();
                }

                const nextState = togglePrimaryAnimationPlayback(scene);
                props.onAnimationStateChange?.(nextState);
                return nextState;
            },
            setAnimationFrame: (frame: number) => {
                const scene = sceneRef.current;
                if (!scene) {
                    return createEmptyAnimationState();
                }

                const nextState = setPrimaryAnimationFrame(scene, frame);
                props.onAnimationStateChange?.(nextState);
                return nextState;
            },
            setActiveAnimationGroup: (groupIndex: number) => {
                const scene = sceneRef.current;
                if (!scene) {
                    return createEmptyAnimationState();
                }

                const nextState = setActiveAnimationGroup(scene, groupIndex);
                props.onAnimationStateChange?.(nextState);
                return nextState;
            },
        }),
        [props.environment, props.onAnimationStateChange, props.onSceneInfoChange, props.onSourceAssetLoaded, props.optimizedAssetUrl, props.skyboxEnabled, props.wireframeEnabled]
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
            <div className="viewerSplitLabels">
                <span>Source</span>
                <span>Optimized</span>
            </div>
            <div className="viewerOverlay">
                <span>Drop `.glb` or `.gltf` files here</span>
            </div>
        </div>
    );
});

function createPreviewScene(engine: Engine, canvas: HTMLCanvasElement): Scene {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.04, 0.06, 0.1, 1);

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
    optimizedAssetUrl: string | null,
    optimizedMeshesRef: MutableRefObject<AbstractMesh[]>,
    onSceneInfoChange: (info: ViewerSceneInfo) => void
) {
    for (const mesh of optimizedMeshesRef.current) {
        mesh.dispose(false, true);
    }
    optimizedMeshesRef.current = [];

    if (!optimizedAssetUrl) {
        return;
    }

    try {
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
    } catch (error) {
        onSceneInfoChange({
            sourceLabel: "Optimized Preview Error",
            message: error instanceof Error ? `Optimized preview failed: ${error.message}` : "Optimized preview failed.",
        });
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
        optimizedAssetUrl: string | null;
        loadReason: "load" | "reload";
        onSceneInfoChange: (info: ViewerSceneInfo) => void;
        onAnimationStateChange?: (state: AnimationControlsState) => void;
        onSourceAssetLoaded?: (asset: LoadedAssetInfo, reason: "load" | "reload") => void | Promise<void>;
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
    const mergedFilesByName = new Map<string, File>();
    for (const file of context.pendingFilesRef.current) {
        mergedFilesByName.set(getDisplayName(file).toLowerCase(), file);
    }
    for (const file of incomingFiles) {
        mergedFilesByName.set(getDisplayName(file).toLowerCase(), file);
    }
    const namedFiles = Array.from(mergedFilesByName.values()).map((file) => {
        const extended = file as File & { correctName?: string };
        extended.correctName = getDisplayName(file);
        return extended;
    });

    const sceneFile = getSceneFile(namedFiles);
    const firstFile = incomingFiles[0] ?? namedFiles[0];
    context.onSceneInfoChange({
        sourceLabel: sceneFile ? getDisplayName(sceneFile) : getDisplayName(firstFile),
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

        if (!sceneFile) {
            context.pendingFilesRef.current = namedFiles;
            throw new Error("No supported scene file found. Upload a `.glb` or a `.gltf`, or add the missing scene file to the current selection.");
        }

        const missingResources = await getMissingGltfResources(sceneFile, namedFiles);
        if (missingResources.length > 0) {
            context.pendingFilesRef.current = namedFiles;
            throw new Error(`Missing sidecar files for ${getDisplayName(sceneFile)}: ${missingResources.join(", ")}. Add those files and try again.`);
        }

        const nextScene = await loadSceneWithFilesInput(engine, namedFiles, context.dataTransferItems, sceneFile);
        const loadedAsset: LoadedAssetInfo = {
            primaryFileName: getDisplayName(sceneFile),
            files: namedFiles,
        };
        context.loadedAssetRef.current = loadedAsset;
        context.pendingFilesRef.current = namedFiles;

        if (previousScene && previousScene !== nextScene) {
            previousScene.dispose();
        }

        context.sceneRef.current = nextScene;
        prepareScene(nextScene, canvas, getDisplayName(sceneFile), context.secondaryCameraRef);
        applySourceLayerMask(nextScene);
        context.environmentPathRef.current = null;
        applyEnvironment(nextScene, context.environment, context.skyboxEnabled, context.sourceSkyboxRef, context.optimizedSkyboxRef, context.environmentPathRef);
        applyWireframe(nextScene, context.wireframeEnabled);
        await context.onSourceAssetLoaded?.(loadedAsset, context.loadReason);
        attachAnimationObserver(nextScene, context.animationObserverRef, context.animationStateRef, context.onAnimationStateChange);

        context.onSceneInfoChange({
            sourceLabel: getDisplayName(sceneFile),
            message: "Scene loaded. Single-canvas compare mode is active with split viewports.",
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown loading error";
        context.animationStateRef.current = createEmptyAnimationState();
        context.onAnimationStateChange?.(context.animationStateRef.current);
        context.onSceneInfoChange({
            sourceLabel: "Load Error",
            message,
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
    scene.clearColor = new Color4(0.04, 0.06, 0.1, 1);

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
        }, 3000);
    });
}
