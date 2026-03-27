import { useState, type ReactNode } from "react";
import type { GltfAssetInfo } from "../features/assetFeatures/extractGltfAssetInfo";
import { formatGltfAssetInfoRows } from "../features/assetFeatures/formatGltfAssetInfo";
import type { GltfAssetInfoRow } from "../features/assetFeatures/formatGltfAssetInfo";
import "./AssetInfoPanel.css";

interface AssetInfoPanelProps {
    info: GltfAssetInfo | null;
    title?: string;
    className?: string;
}

const URL_PATTERN = /https?:\/\/[^\s]+/g;
const LEADING_URL_TRIM = /^[([{'"`]+/;
const TRAILING_URL_TRIM = /[)\]}",;'`!?]+$/;
const CHEVRON = "\u25BE";
const DOCK_CHEVRON = "\u2039";

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

function renderCompactStatCell(row: GltfAssetInfoRow): ReactNode {
    return (
        <div key={row.label ?? "stat"} className="assetInfoCompactStatCell">
            <div className="assetInfoCompactStatLabel">{row.label ?? ""}</div>
            <div className="assetInfoCompactStatValue">
                {row.items.map((item) => (
                    <span key={item}>{renderLinkedText(item)}</span>
                ))}
            </div>
        </div>
    );
}

function renderCompactStatsRow(rows: GltfAssetInfoRow[], className: string): ReactNode {
    return <div className={className}>{rows.map((row) => renderCompactStatCell(row))}</div>;
}

export function AssetInfoPanel({ info, title = "Asset Info", className = "" }: AssetInfoPanelProps) {
    if (!info) {
        return null;
    }

    const rows = formatGltfAssetInfoRows(info);
    const [panelCollapsed, setPanelCollapsed] = useState(false);
    const [metadataCollapsed, setMetadataCollapsed] = useState(false);
    const [sceneStatsCollapsed, setSceneStatsCollapsed] = useState(false);
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

    return (
        <aside className={`assetInfoSidebar${panelCollapsed ? " isDockCollapsed" : ""} ${className}`.trim()}>
            <div className="assetInfoSidebarHeader">
                {!panelCollapsed ? <span className="assetInfoPanelLabel">{title}</span> : null}
                <div className="assetInfoHeaderControls">
                    <button
                        type="button"
                        className="assetInfoHeaderToggle"
                        onClick={() => setPanelCollapsed((current) => !current)}
                        aria-expanded={!panelCollapsed}
                        aria-label={panelCollapsed ? "Expand asset info panel" : "Collapse asset info panel"}
                        title={panelCollapsed ? "Expand panel" : "Collapse panel"}
                    >
                        <span className={`assetInfoDockChevron${panelCollapsed ? " isCollapsed" : ""}`}>{DOCK_CHEVRON}</span>
                    </button>
                    {!panelCollapsed && collapsibleMetadataRows.length ? (
                        <button
                            type="button"
                            className="assetInfoHeaderToggle"
                            onClick={() => setMetadataCollapsed((current) => !current)}
                            aria-expanded={!metadataCollapsed}
                            aria-label={metadataCollapsed ? "Expand asset metadata" : "Collapse asset metadata"}
                            title={metadataCollapsed ? "Expand asset metadata" : "Collapse asset metadata"}
                        >
                            <span className={`assetInfoCollapseChevron${metadataCollapsed ? " isCollapsed" : ""}`}>{CHEVRON}</span>
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
                                onClick={() => setSceneStatsCollapsed((current) => !current)}
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
                                <span className={`assetInfoCollapseChevron${sceneStatsCollapsed ? " isCollapsed" : ""}`}>{CHEVRON}</span>
                            </button>
                            {!sceneStatsCollapsed ? (
                                <>
                                    {compactSceneStatsRows.length ? renderCompactStatsRow(compactSceneStatsRows, "assetInfoCompactStatsRow") : null}
                                    {compactSceneStatsTwoColumnRows.length
                                        ? renderCompactStatsRow(compactSceneStatsTwoColumnRows, "assetInfoCompactStatsRow assetInfoCompactStatsRowTwo")
                                        : null}
                                    {compactSceneStatsLastTwoColumnRows.length
                                        ? renderCompactStatsRow(compactSceneStatsLastTwoColumnRows, "assetInfoCompactStatsRow assetInfoCompactStatsRowTwo")
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
