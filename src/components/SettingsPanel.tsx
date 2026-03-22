import type { Dispatch, SetStateAction } from "react";
import type { LoadedAssetKind, OptimizerSettings } from "../app/model";
import { Button, Field, Input, Select, Switch, Text } from "@fluentui/react-components";
import "./SettingsPanel.css";

interface SettingsPanelProps {
    settings: OptimizerSettings;
    defaultSettings: OptimizerSettings;
    activeAssetKind: LoadedAssetKind | null;
    onSettingsChange: Dispatch<SetStateAction<OptimizerSettings>>;
    onExplainStage: (message: string) => void;
}

function Section(props: { title: string; children: React.ReactNode }) {
    return (
        <section className="settingsSection">
            <h2>{props.title}</h2>
            <div className="settingsGrid">{props.children}</div>
        </section>
    );
}

function ToggleRow(props: {
    label: string;
    checked: boolean;
    onChange: (next: boolean) => void;
}) {
    return (
        <div className="fieldRow checkboxRow">
            <Switch label={props.label} checked={props.checked} onChange={(_event, data) => props.onChange(Boolean(data.checked))} />
        </div>
    );
}

function NumberRow(props: {
    label: string;
    value: number;
    step: number;
    min?: number;
    max?: number;
    onChange: (next: number) => void;
}) {
    return (
        <Field className="fieldRow" label={props.label}>
            <Input
                type="number"
                value={String(props.value)}
                step={props.step}
                min={props.min}
                max={props.max}
                onChange={(event) => props.onChange(Number(event.target.value))}
            />
        </Field>
    );
}

function SelectRow<T extends string>(props: {
    label: string;
    value: T;
    options: Array<{ value: T; label: string }>;
    onChange: (next: T) => void;
}) {
    return (
        <Field className="fieldRow" label={props.label}>
            <Select value={props.value} onChange={(event) => props.onChange(event.target.value as T)}>
                {props.options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </Select>
        </Field>
    );
}

export function SettingsPanel(props: SettingsPanelProps) {
    const isTextureOnlyMode = props.activeAssetKind === "texture";
    const update = (patch: Partial<OptimizerSettings>, message?: string) => {
        props.onSettingsChange((current) => ({ ...current, ...patch }));
        if (message) {
            props.onExplainStage(message);
        }
    };

    return (
        <div className="settingsPanel">
            <div className="settingsIntro">
                <h2>Optimization Controls</h2>
                {isTextureOnlyMode ? (
                    <Text block>
                        Texture-only mode uses the texture settings below. Mesh and scene transforms are hidden because they only affect GLB and GLTF assets.
                    </Text>
                ) : null}
            </div>

            <Section title="Output">
                <NumberRow
                    label="timeToWaitBeforeSuspend"
                    value={props.settings.timeToWaitBeforeSuspend}
                    step={100}
                    min={0}
                    onChange={(value) => update({ timeToWaitBeforeSuspend: Math.max(0, value) })}
                />

                <SelectRow
                    label="Resize"
                    value={props.settings.resize}
                    options={[
                        { value: "No Resize", label: "No Resize" },
                        { value: "2048", label: "2048" },
                        { value: "1024", label: "1024" },
                        { value: "512", label: "512" },
                        { value: "256", label: "256" },
                    ]}
                    onChange={(value) => update({ resize: value }, `Resize set to ${value}.`)}
                />

                <SelectRow
                    label="Texture Format"
                    value={props.settings.textureMode}
                    options={[
                        { value: "keep", label: "Keep Original" },
                        { value: "webp", label: "WEBP" },
                        { value: "png", label: "PNG" },
                        { value: "ktx2-uastc", label: "KTX2 UASTC" },
                        { value: "ktx2-etc1s", label: "KTX2 ETC1S" },
                        { value: "ktx2-mix", label: "KTX2 MIX" },
                        { value: "ktx2-user", label: "KTX2 USER" },
                    ]}
                    onChange={(value) => update({ textureMode: value })}
                />

                <SelectRow
                    label="Texture Export"
                    value={props.settings.textureExportMode}
                    options={[
                        { value: "image", label: "Image" },
                        { value: "glb-plane", label: "GLB Plane" },
                    ]}
                    onChange={(value) => update({ textureExportMode: value })}
                />
            </Section>

            {!isTextureOnlyMode ? (
                <>
                    <Section title="Basic">
                        <ToggleRow label="Dedup" checked={props.settings.dedup} onChange={(value) => update({ dedup: value })} />
                        <ToggleRow label="Prune" checked={props.settings.prune} onChange={(value) => update({ prune: value })} />
                        <ToggleRow label="Flatten" checked={props.settings.flatten} onChange={(value) => update({ flatten: value })} />
                        <ToggleRow label="Join" checked={props.settings.join} onChange={(value) => update({ join: value })} />
                        <ToggleRow label="Resample" checked={props.settings.resample} onChange={(value) => update({ resample: value })} />
                        <ToggleRow label="Sparse" checked={props.settings.sparse} onChange={(value) => update({ sparse: value })} />
                        <NumberRow label="Sparse Ratio" value={props.settings.sparseRatio} step={0.01} min={0} max={1} onChange={(value) => update({ sparseRatio: value })} />
                        <ToggleRow label="Weld" checked={props.settings.weld} onChange={(value) => update({ weld: value })} />
                        <NumberRow label="Weld Tolerance" value={props.settings.weldTolerance} step={0.001} min={0} onChange={(value) => update({ weldTolerance: value })} />
                        <NumberRow
                            label="Weld Normal Tolerance"
                            value={props.settings.weldToleranceNormal}
                            step={0.01}
                            min={0}
                            onChange={(value) => update({ weldToleranceNormal: value })}
                        />
                    </Section>

                    <Section title="Meshoptimizer">
                        <ToggleRow label="Draco Compression" checked={props.settings.draco} onChange={(value) => update({ draco: value })} />
                        <ToggleRow label="Simplify" checked={props.settings.simplify} onChange={(value) => update({ simplify: value })} />
                        <NumberRow label="Simplify Ratio" value={props.settings.simplifyRatio} step={0.01} min={0} max={1} onChange={(value) => update({ simplifyRatio: value })} />
                        <NumberRow label="Simplify Error" value={props.settings.simplifyError} step={0.0001} min={0} onChange={(value) => update({ simplifyError: value })} />
                        <ToggleRow label="Lock Border" checked={props.settings.simplifyLockBorder} onChange={(value) => update({ simplifyLockBorder: value })} />
                        <ToggleRow label="Reorder" checked={props.settings.reorder} onChange={(value) => update({ reorder: value })} />
                        <ToggleRow label="Quantize" checked={props.settings.quantize} onChange={(value) => update({ quantize: value })} />
                        <ToggleRow label="Meshopt Compression" checked={props.settings.meshopt} onChange={(value) => update({ meshopt: value })} />
                        <SelectRow
                            label="Meshopt Level"
                            value={props.settings.meshoptLevel}
                            options={[
                                { value: "high", label: "High" },
                                { value: "medium", label: "Medium" },
                            ]}
                            onChange={(value) => update({ meshoptLevel: value })}
                        />
                    </Section>
                </>
            ) : null}

            <Section title="KTX2">
                <NumberRow label="Quality Level" value={props.settings.qualityLevel} step={1} min={1} max={255} onChange={(value) => update({ qualityLevel: value })} />
                <NumberRow label="Compression Level" value={props.settings.compressionLevel} step={1} min={0} max={5} onChange={(value) => update({ compressionLevel: value })} />
                <ToggleRow label="Supercompression" checked={props.settings.supercompression} onChange={(value) => update({ supercompression: value })} />
                {!isTextureOnlyMode ? <ToggleRow label="GPU Instancing" checked={props.settings.gpuInstancing} onChange={(value) => update({ gpuInstancing: value })} /> : null}
                <ToggleRow label="Base Color Uses UASTC" checked={props.settings.baseColorUASTC} onChange={(value) => update({ baseColorUASTC: value })} />
                <ToggleRow label="Normal Uses UASTC" checked={props.settings.normalUASTC} onChange={(value) => update({ normalUASTC: value })} />
                <ToggleRow label="Metallic Uses UASTC" checked={props.settings.metallicUASTC} onChange={(value) => update({ metallicUASTC: value })} />
                <ToggleRow label="Emissive Uses UASTC" checked={props.settings.emissiveUASTC} onChange={(value) => update({ emissiveUASTC: value })} />
                <ToggleRow label="Occlusion Uses UASTC" checked={props.settings.occlusionUASTC} onChange={(value) => update({ occlusionUASTC: value })} />
            </Section>

            <div className="settingsFooter">
                <Button
                    appearance="secondary"
                    onClick={() => {
                        props.onSettingsChange(() => props.defaultSettings);
                        props.onExplainStage("Settings restored to defaults.");
                    }}
                >
                    Restore Defaults
                </Button>
            </div>
        </div>
    );
}
