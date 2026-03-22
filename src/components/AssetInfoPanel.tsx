import type { ReactNode } from "react";
import type { GltfAssetInfo } from "../features/assetFeatures/extractGltfAssetInfo";
import { formatGltfAssetInfoRows } from "../features/assetFeatures/formatGltfAssetInfo";
import "./AssetInfoPanel.css";

interface AssetInfoPanelProps {
    info: GltfAssetInfo | null;
    title?: string;
    className?: string;
}

export function AssetInfoPanel({ info, title = "Asset Info", className = "" }: AssetInfoPanelProps) {
    if (!info) {
        return null;
    }

    const rows = formatGltfAssetInfoRows(info);
    const renderedSections: ReactNode[] = [];

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
                                        <span key={item}>{item}</span>
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

        renderedSections.push(
            <div key={`${row.section ?? "no-section"}-${row.label ?? "continued"}-${row.variant}-${index}`}>
                {row.section ? <div className="assetInfoSectionHeader">{row.section}</div> : null}
                <div className="assetInfoRow">
                    <div className="assetInfoRowLabel">{row.label ?? ""}</div>
                    <div className="assetInfoRowValues">
                        {row.items.map((item) => (
                            <span key={item}>{item}</span>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <aside className={`assetInfoSidebar ${className}`.trim()}>
            <div className="assetInfoSidebarHeader">
                <span className="assetInfoPanelLabel">{title}</span>
            </div>
            <div className="assetInfoPanel">{renderedSections}</div>
        </aside>
    );
}
