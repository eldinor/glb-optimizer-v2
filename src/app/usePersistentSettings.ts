import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS } from "./defaultSettings";
import type { OptimizerSettings } from "./model";

const STORAGE_KEY = "newsandbox.optimizer.settings";

function readSettings(): OptimizerSettings {
    if (typeof window === "undefined") {
        return DEFAULT_SETTINGS;
    }

    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) {
        return DEFAULT_SETTINGS;
    }

    try {
        const parsed = JSON.parse(rawValue) as Partial<OptimizerSettings>;
        return {
            ...DEFAULT_SETTINGS,
            ...parsed,
        };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

export function usePersistentSettings() {
    const [settings, setSettings] = useState<OptimizerSettings>(readSettings);

    useEffect(() => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }, [settings]);

    return {
        settings,
        setSettings,
        resetSettings: () => setSettings(DEFAULT_SETTINGS),
    };
}
