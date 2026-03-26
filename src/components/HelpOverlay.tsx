import { Button } from "@fluentui/react-components";

interface HelpOverlayProps {
    open: boolean;
    onClose: () => void;
}

export function HelpOverlay({ open, onClose }: HelpOverlayProps) {
    if (!open) {
        return null;
    }

    return (
        <div className="overlayContainer">
            <div className="helpOverlay">
                <div className="overlayHeader">
                    <h2>Help</h2>
                    <Button className="overlayClose" appearance="subtle" onClick={onClose}>
                        Close
                    </Button>
                </div>
                <div className="helpContent">
                    <p>Open a scene or supported texture, adjust settings, then run optimization or conversion before downloading the result. Scene transforms are built from the installed GLTF-Transform API used by this app.</p>
                    <h3>Cleanup</h3>
                    <ul>
                        <li><strong>Dedup</strong> removes duplicate accessors, meshes, textures, materials, and skins so shared resources are reused instead of stored multiple times.</li>
                        <li><strong>Prune</strong> removes properties that are no longer referenced by a scene, which is especially useful after other transforms detach or merge content.</li>
                        <li><strong>Flatten</strong> flattens the scene graph so attached content becomes direct children of the scene where possible, while preserving skeletons and animation constraints.</li>
                        <li><strong>Join</strong> merges compatible primitives to reduce draw calls. It works best after dedup and flatten, because more primitives become eligible to combine.</li>
                        <li><strong>Resample</strong> losslessly removes duplicate animation keyframes, reducing baked animation data without changing the motion.</li>
                    </ul>
                    <h3>Geometry</h3>
                    <ul>
                        <li><strong>Sparse</strong> rewrites accessors to sparse storage when many values are zero, which is especially helpful for morph target data.</li>
                        <li><strong>Sparse Ratio</strong> controls how aggressively zero-heavy accessors are switched to sparse storage.</li>
                        <li><strong>Weld</strong> merges bitwise-identical vertices so indexed geometry shares data more efficiently and can make later simplification work better.</li>
                    </ul>
                    <h3>Compression</h3>
                    <ul>
                        <li><strong>Draco Compression</strong> applies `KHR_draco_mesh_compression` to reduce triangle geometry size. Compression is written at export time.</li>
                        <li><strong>Meshopt Compression</strong> applies `EXT_meshopt_compression`, combining reordering and quantization to reduce geometry, morph target, and animation data size. Compression is written at export time.</li>
                        <li><strong>Meshopt Level</strong> changes how aggressively Meshopt packs attributes.</li>
                        <li><strong>Quantize</strong> reduces attribute precision on a quantization grid, shrinking geometry data at the cost of precision.</li>
                        <li><strong>Reorder</strong> reorders primitive data for better locality of reference, improving transmission size or rendering efficiency.</li>
                    </ul>
                    <h3>Simplification</h3>
                    <ul>
                        <li><strong>Simplify</strong> uses Meshoptimizer simplification to reduce triangle and vertex counts while trying to preserve visible shape.</li>
                        <li><strong>Simplify Ratio</strong> is the target fraction of geometry to keep.</li>
                        <li><strong>Simplify Error</strong> limits how much geometric error is allowed before the simplifier stops.</li>
                        <li><strong>Lock Border</strong> keeps topological borders stable, which can help avoid seams when simplifying chunked meshes.</li>
                    </ul>
                    <h3>Mesh</h3>
                    <ul>
                        <li><strong>GPU Instancing</strong> creates `EXT_mesh_gpu_instancing` batches for repeated meshes, reducing draw calls when identical meshes are reused.</li>
                    </ul>
                    <h3>Texture</h3>
                    <ul>
                        <li><strong>Resize</strong> and <strong>Format</strong> use GLTF-Transform texture compression and resizing before export.</li>
                        <li><strong>Quality Level</strong>, <strong>Compression Level</strong>, <strong>Supercompression</strong>, and the UASTC toggles control KTX2 encoding behavior when a KTX2 mode is selected.</li>
                        <li><strong>Texture Export</strong> in User Settings chooses whether standalone textures download as an optimized image or as a GLB preview plane.</li>
                    </ul>
                    <h3>Compare View</h3>
                    <p>The left half shows the source scene. The right half shows the optimized preview scene. Screenshot compare overlays the diff image on the optimized side.</p>
                    <h3>Files</h3>
                    <p>Use Open or drag files onto the render area. `.glb` and `.gltf` scenes can be optimized for GLB download or zipped GLTF download. Standalone PNG, JPG, JPEG, and WEBP textures can be optimized through a generated plane and exported either as an image or as a GLB plane.</p>
                </div>
            </div>
        </div>
    );
}
