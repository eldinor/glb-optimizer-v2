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

    return (
        <aside className={`assetInfoSidebar ${className}`.trim()}>
            <div className="assetInfoSidebarHeader">
                <span className="assetInfoPanelLabel">{title}</span>
            </div>
            <div className="assetInfoPanel">
                {rows.map((row, index) => (
                    <div
                        key={`${row.label ?? "continued"}-${row.variant}-${index}`}
                        className={`assetInfoRow${row.variant === "extensions" ? " assetInfoExtensions" : ""}`}
                    >
                        <div className="assetInfoRowLabel">{row.label ?? ""}</div>
                        <div className="assetInfoRowValues">
                            {row.items.map((item) => (
                                <span key={item}>{item}</span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </aside>
    );
}
