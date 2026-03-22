export interface EnvironmentPreset {
    id: string;
    label: string;
    path: string;
}

export const ENVIRONMENT_PRESETS: EnvironmentPreset[] = [
    {
        id: "default",
        label: "Default",
        path: "https://assets.babylonjs.com/environments/environmentSpecular.env",
    },
    {
        id: "studio",
        label: "Studio",
        path: "https://assets.babylonjs.com/environments/studio.env",
    },
];
