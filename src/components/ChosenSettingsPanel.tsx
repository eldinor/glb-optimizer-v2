import type { LoadedAssetKind, OptimizerSettings } from "../app/model";
import "./ChosenSettingsPanel.css";

interface ChosenSettingsPanelProps {
    settings: OptimizerSettings;
    activeAssetKind: LoadedAssetKind | null;
    footerHidden: boolean;
}

interface SettingRow {
    label: string;
    value: string;
}

export function getChosenSettingsRows(settings: OptimizerSettings, activeAssetKind: LoadedAssetKind | null): SettingRow[] {
    const rows: SettingRow[] = [
        { label: "Resize", value: settings.resize },
        { label: "Texture", value: settings.textureMode.toUpperCase().replace("KEEP", "Keep Original") },
    ];

    if (activeAssetKind === "texture") {
        rows.push({
            label: "Export",
            value: settings.textureExportMode === "image" ? "Image" : "GLB Plane",
        });
    }

    if (activeAssetKind !== "texture") {
        const cleanupTransforms = [
            settings.dedup && "Dedup",
            settings.prune && "Prune",
            settings.flatten && "Flatten",
            settings.join && "Join",
            settings.resample && "Resample",
        ].filter(Boolean);

        const geometryTransforms = [
            settings.sparse && `Sparse ${settings.sparseRatio.toFixed(2)}`,
            settings.weld && "Weld",
        ].filter(Boolean);

        const compressionTransforms = [
            settings.draco && "Draco",
            settings.meshopt && `Meshopt ${settings.meshoptLevel}`,
            settings.quantize && "Quantize",
            settings.reorder && "Reorder",
        ].filter(Boolean);

        const simplificationTransforms = [
            settings.simplify && `Simplify ${settings.simplifyRatio.toFixed(2)}`,
            settings.simplify && `Error ${settings.simplifyError}`,
            settings.simplifyLockBorder && "Lock Border",
        ].filter(Boolean);

        const meshTransforms = [
            settings.gpuInstancing && "GPU Instancing",
        ].filter(Boolean);

        rows.push({
            label: "Cleanup",
            value: cleanupTransforms.length ? cleanupTransforms.join(", ") : "None",
        });
        rows.push({
            label: "Geometry",
            value: geometryTransforms.length ? geometryTransforms.join(", ") : "None",
        });
        rows.push({
            label: "Compression",
            value: compressionTransforms.length ? compressionTransforms.join(", ") : "None",
        });
        rows.push({
            label: "Simplification",
            value: simplificationTransforms.length ? simplificationTransforms.join(", ") : "None",
        });
        rows.push({
            label: "Mesh",
            value: meshTransforms.length ? meshTransforms.join(", ") : "None",
        });
    }

    const showKtxSettings = settings.textureMode.startsWith("ktx2");
    if (showKtxSettings) {
        rows.push({
            label: "KTX2",
            value: `Q${settings.qualityLevel}, C${settings.compressionLevel}${settings.supercompression ? ", Supercompression" : ""}`,
        });

        const uastcTargets = [
            settings.baseColorUASTC && "Base",
            settings.normalUASTC && "Normal",
            settings.metallicUASTC && "Metallic",
            settings.emissiveUASTC && "Emissive",
            settings.occlusionUASTC && "Occlusion",
        ].filter(Boolean);

        if (uastcTargets.length) {
            rows.push({
                label: "UASTC",
                value: uastcTargets.join(", "),
            });
        }
    }

    return rows;
}

export function ChosenSettingsPanel({ settings, activeAssetKind, footerHidden }: ChosenSettingsPanelProps) {
    const rows = getChosenSettingsRows(settings, activeAssetKind);

    return (
        <aside className={`chosenSettingsPanel${footerHidden ? " isExpanded" : ""}`}>
            <div className="chosenSettingsPanelHeader">Chosen Settings</div>
            <div className="chosenSettingsPanelBody">
                {rows.map((row) => (
                    <div key={row.label} className="chosenSettingsRow">
                        <div className="chosenSettingsLabel">{row.label}</div>
                        <div className="chosenSettingsValue">{row.value}</div>
                    </div>
                ))}
            </div>
        </aside>
    );
}
