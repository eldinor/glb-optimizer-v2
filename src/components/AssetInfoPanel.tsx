import type { ReactNode } from "react";
import { ChevronDownRegular, ChevronLeftRegular, ChevronRightRegular, DismissRegular } from "@fluentui/react-icons";
import type { GltfAssetInfo } from "../features/assetFeatures/extractGltfAssetInfo";
import { formatGltfAssetInfoRows } from "../features/assetFeatures/formatGltfAssetInfo";
import type { GltfAssetInfoRow } from "../features/assetFeatures/formatGltfAssetInfo";
import "./AssetInfoPanel.css";

interface AssetInfoPanelProps {
    info: GltfAssetInfo | null;
    compareInfo?: GltfAssetInfo | null;
    title?: string;
    className?: string;
    onCloseAllPanels?: () => void;
    metadataCollapsed?: boolean;
    onMetadataCollapsedChange?: (nextValue: boolean) => void;
    sceneStatsCollapsed?: boolean;
    onSceneStatsCollapsedChange?: (nextValue: boolean) => void;
    panelCollapsed?: boolean;
    onPanelCollapsedChange?: (nextValue: boolean) => void;
    dockSide?: "left" | "right";
}

const URL_PATTERN = /https?:\/\/[^\s]+/g;
const LEADING_URL_TRIM = /^[([{'"`]+/;
const TRAILING_URL_TRIM = /[)\]}",;'`!?]+$/;

function renderLinkedText(value: string): ReactNode {
    const matches = Array.from(value.matchAll(URL_PATTERN));
    if (!matches.length) {
        return value;
    }

    const parts: ReactNode[] = [];
    let cursor = 0;

    for (const match of matches) {
        const rawUrl = match[0];
        const matchIndex = match.index ?? 0;
        let urlStart = matchIndex;
        const urlEnd = matchIndex + rawUrl.length;
        const leadingTrimmed = rawUrl.match(LEADING_URL_TRIM)?.[0] ?? "";
        const trailingTrimmed = rawUrl.match(TRAILING_URL_TRIM)?.[0] ?? "";

        if (matchIndex > cursor) {
            parts.push(value.slice(cursor, matchIndex));
        }

        if (leadingTrimmed) {
            parts.push(leadingTrimmed);
            urlStart += leadingTrimmed.length;
        }

        const normalizedUrl = value.slice(urlStart, urlEnd - trailingTrimmed.length);
        parts.push(
            <a key={`${normalizedUrl}-${urlStart}`} className="assetInfoLink" href={normalizedUrl} target="_blank" rel="noreferrer">
                {normalizedUrl}
            </a>
        );

        if (trailingTrimmed) {
            parts.push(trailingTrimmed);
        }

        cursor = urlEnd;
    }

    if (cursor < value.length) {
        parts.push(value.slice(cursor));
    }

    return parts;
}

function renderDefaultRow(row: GltfAssetInfoRow, index: number): ReactNode {
    return (
        <div key={`${row.section ?? "no-section"}-${row.label ?? "continued"}-${row.variant}-${index}`}>
            <div className="assetInfoRow">
                <div className="assetInfoRowLabel">{row.label ?? ""}</div>
                <div className="assetInfoRowValues">
                    {row.items.map((item) => (
                        <span key={item}>{renderLinkedText(item)}</span>
                    ))}
                </div>
            </div>
        </div>
    );
}

const COMPARABLE_SCENE_STAT_KEYS = {
    Nodes: "nodeCount",
    Meshes: "meshCount",
    Primitives: "primitiveCount",
    Materials: "materialCount",
    Textures: "textureCount",
    Images: "imageCount",
} as const satisfies Record<string, keyof GltfAssetInfo>;

type ComparableSceneStatLabel = keyof typeof COMPARABLE_SCENE_STAT_KEYS;

function getCompactStatDeltaInfo(row: GltfAssetInfoRow, info: GltfAssetInfo, compareInfo: GltfAssetInfo | null | undefined) {
    const label = row.label as ComparableSceneStatLabel | undefined;
    if (!label || !(label in COMPARABLE_SCENE_STAT_KEYS) || !compareInfo) {
        return null;
    }

    const key = COMPARABLE_SCENE_STAT_KEYS[label];
    const currentValue = info[key];
    const previousValue = compareInfo[key];
    const delta = currentValue - previousValue;

    if (delta === 0) {
        return null;
    }

    return {
        tone: delta < 0 ? "smaller" : "bigger",
        text: delta < 0 ? `${delta}` : `+${delta}`,
    } as const;
}

function renderCompactStatCell(row: GltfAssetInfoRow, info: GltfAssetInfo, compareInfo?: GltfAssetInfo | null): ReactNode {
    const deltaInfo = getCompactStatDeltaInfo(row, info, compareInfo);
    return (
        <div key={row.label ?? "stat"} className="assetInfoCompactStatCell">
            <div className="assetInfoCompactStatLabel">{row.label ?? ""}</div>
            <div className="assetInfoCompactStatValue">
                {row.items.map((item) => (
                    <span key={item} className="assetInfoStatValueWithDelta">
                        <span className="assetInfoStatValueText">{renderLinkedText(item)}</span>
                        <span className={`assetInfoStatDelta${deltaInfo ? ` assetInfoStatDelta--${deltaInfo.tone}` : " assetInfoStatDelta--placeholder"}`}>
                            {deltaInfo ? deltaInfo.text : "\u00A0"}
                        </span>
                    </span>
                ))}
            </div>
        </div>
    );
}

function renderCompactStatsRow(rows: GltfAssetInfoRow[], className: string, info: GltfAssetInfo, compareInfo?: GltfAssetInfo | null): ReactNode {
    return <div className={className}>{rows.map((row) => renderCompactStatCell(row, info, compareInfo))}</div>;
}

export function AssetInfoPanel({
    info,
    compareInfo,
    title = "Asset Info",
    className = "",
    onCloseAllPanels,
    metadataCollapsed = false,
    onMetadataCollapsedChange,
    sceneStatsCollapsed = false,
    onSceneStatsCollapsedChange,
    panelCollapsed = false,
    onPanelCollapsedChange,
    dockSide = "left",
}: AssetInfoPanelProps) {
    if (!info) {
        return null;
    }

    const rows = formatGltfAssetInfoRows(info);
    const renderedSections: ReactNode[] = [];
    const collapsibleMetadataRows: ReactNode[] = [];
    const sceneStatsRows: ReactNode[] = [];
    const compactSceneStatsRows: GltfAssetInfoRow[] = [];
    const compactSceneStatsTwoColumnRows: GltfAssetInfoRow[] = [];
    const compactSceneStatsLastTwoColumnRows: GltfAssetInfoRow[] = [];
    const trailingMetadataRows: ReactNode[] = [];

    const sceneStatsLabels = new Set(["Nodes", "Meshes", "Primitives", "Materials", "Textures", "Images", "Animations", "Skins", "Cameras", "Lights"]);
    const compactSceneStatsLabels = new Set(["Nodes", "Meshes", "Primitives", "Materials", "Textures", "Images"]);
    const compactSceneStatsTwoColumnLabels = new Set(["Animations", "Skins"]);
    const compactSceneStatsLastTwoColumnLabels = new Set(["Cameras", "Lights"]);

    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];

        if (row.variant === "extensions") {
            const extensionRows = [row];
            let nextIndex = index + 1;
            while (nextIndex < rows.length && rows[nextIndex].variant === "extensions") {
                extensionRows.push(rows[nextIndex]);
                nextIndex += 1;
            }

            renderedSections.push(
                <div key={`${row.section ?? "extensions"}-${index}`}>
                    {row.section ? <div className="assetInfoSectionHeader">{row.section}</div> : null}
                    <div className="assetInfoExtensionColumns">
                        {extensionRows.map((extensionRow) => (
                            <div key={extensionRow.label ?? "extensions"} className="assetInfoExtensionGroup">
                                <div className="assetInfoExtensionLabel">{extensionRow.label ?? ""}</div>
                                <div className="assetInfoExtensionValues">
                                    {extensionRow.items.map((item) => (
                                        <span key={item}>{renderLinkedText(item)}</span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );

            index = nextIndex - 1;
            continue;
        }

        if (row.label === "Scenes") {
            continue;
        }

        const renderedRow = renderDefaultRow(row, index);

        if (compactSceneStatsLabels.has(row.label ?? "")) {
            compactSceneStatsRows.push(row);
            continue;
        }

        if (compactSceneStatsTwoColumnLabels.has(row.label ?? "")) {
            compactSceneStatsTwoColumnRows.push(row);
            continue;
        }

        if (compactSceneStatsLastTwoColumnLabels.has(row.label ?? "")) {
            compactSceneStatsLastTwoColumnRows.push(row);
            continue;
        }

        if (sceneStatsLabels.has(row.label ?? "")) {
            sceneStatsRows.push(renderedRow);
            continue;
        }

        if (!row.section) {
            if (["Generator", "Author", "License", "Source"].includes(row.label ?? "")) {
                collapsibleMetadataRows.push(renderedRow);
            } else {
                trailingMetadataRows.push(renderedRow);
            }
            continue;
        }

        renderedSections.push(renderedRow);
    }

    const hasSceneStatsSection =
        compactSceneStatsRows.length > 0 ||
        compactSceneStatsTwoColumnRows.length > 0 ||
        compactSceneStatsLastTwoColumnRows.length > 0 ||
        sceneStatsRows.length > 0 ||
        info.sceneCount > 0;
    const DockChevronIcon =
        dockSide === "right"
            ? panelCollapsed
                ? ChevronLeftRegular
                : ChevronRightRegular
            : panelCollapsed
              ? ChevronRightRegular
              : ChevronLeftRegular;
    const MetadataChevronIcon = metadataCollapsed ? ChevronRightRegular : ChevronDownRegular;
    const SceneStatsChevronIcon = sceneStatsCollapsed ? ChevronRightRegular : ChevronDownRegular;

    return (
        <aside className={`assetInfoSidebar assetInfoSidebar--${dockSide}${panelCollapsed ? " isDockCollapsed" : ""} ${className}`.trim()}>
            <div className="assetInfoSidebarHeader">
                {!panelCollapsed && dockSide === "right" ? (
                    <div className="assetInfoCenterControls">
                        <button
                            type="button"
                            className="assetInfoHeaderToggle"
                            onClick={onCloseAllPanels}
                            aria-label="Close all asset info panels"
                            title="Close all asset info panels"
                        >
                            <DismissRegular className="assetInfoIcon" />
                        </button>
                    </div>
                ) : null}
                {!panelCollapsed ? <span className="assetInfoPanelLabel">{title}</span> : null}
                <div className="assetInfoHeaderControls">
                    <button
                        type="button"
                        className="assetInfoHeaderToggle"
                        onClick={() => onPanelCollapsedChange?.(!panelCollapsed)}
                        aria-expanded={!panelCollapsed}
                        aria-label={panelCollapsed ? "Expand asset info panel" : "Collapse asset info panel"}
                        title={panelCollapsed ? "Expand panel" : "Collapse panel"}
                    >
                        <DockChevronIcon className="assetInfoIcon assetInfoDockChevron" />
                    </button>
                    {!panelCollapsed && collapsibleMetadataRows.length ? (
                        <button
                            type="button"
                            className="assetInfoHeaderToggle"
                            onClick={() => onMetadataCollapsedChange?.(!metadataCollapsed)}
                            aria-expanded={!metadataCollapsed}
                            aria-label={metadataCollapsed ? "Expand asset metadata" : "Collapse asset metadata"}
                            title={metadataCollapsed ? "Expand asset metadata" : "Collapse asset metadata"}
                        >
                            <MetadataChevronIcon className="assetInfoIcon assetInfoCollapseChevron" />
                        </button>
                    ) : null}
                    {!panelCollapsed && dockSide === "left" ? (
                        <button
                            type="button"
                            className="assetInfoHeaderToggle"
                            onClick={onCloseAllPanels}
                            aria-label="Close all asset info panels"
                            title="Close all asset info panels"
                        >
                            <DismissRegular className="assetInfoIcon" />
                        </button>
                    ) : null}
                </div>
            </div>
            {!panelCollapsed ? (
                <div className="assetInfoPanel">
                    {!metadataCollapsed ? collapsibleMetadataRows : null}
                    {hasSceneStatsSection ? (
                        <div className="assetInfoSectionBlock">
                            <button
                                type="button"
                                className="assetInfoSectionToggle"
                                onClick={() => onSceneStatsCollapsedChange?.(!sceneStatsCollapsed)}
                                aria-expanded={!sceneStatsCollapsed}
                            >
                                <span className="assetInfoSectionToggleTitle">Scene Stats</span>
                                <span className="assetInfoSectionToggleGrid">
                                    <span className="assetInfoSectionToggleGridCell" aria-hidden="true" />
                                    <span className="assetInfoSectionToggleGridCell">
                                        <span className="assetInfoCompactStatCell assetInfoCompactStatCellHeader">
                                            <span className="assetInfoCompactStatLabel">Scenes</span>
                                            <span className="assetInfoCompactStatValue">{info.sceneCount}</span>
                                        </span>
                                    </span>
                                    <span className="assetInfoSectionToggleGridCell" aria-hidden="true" />
                                </span>
                                <SceneStatsChevronIcon className="assetInfoIcon assetInfoCollapseChevron" />
                            </button>
                            {!sceneStatsCollapsed ? (
                                <>
                                    {compactSceneStatsRows.length
                                        ? renderCompactStatsRow(compactSceneStatsRows, "assetInfoCompactStatsRow", info, compareInfo)
                                        : null}
                                    {compactSceneStatsTwoColumnRows.length
                                        ? renderCompactStatsRow(
                                              compactSceneStatsTwoColumnRows,
                                              "assetInfoCompactStatsRow assetInfoCompactStatsRowTwo",
                                              info
                                          )
                                        : null}
                                    {compactSceneStatsLastTwoColumnRows.length
                                        ? renderCompactStatsRow(
                                              compactSceneStatsLastTwoColumnRows,
                                              "assetInfoCompactStatsRow assetInfoCompactStatsRowTwo",
                                              info
                                          )
                                        : null}
                                    {sceneStatsRows}
                                </>
                            ) : null}
                        </div>
                    ) : null}
                    {trailingMetadataRows}
                    {renderedSections}
                </div>
            ) : null}
        </aside>
    );
}
