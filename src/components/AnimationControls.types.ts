export interface AnimationControlsState {
    hasAnimations: boolean;
    isPlaying: boolean;
    currentFrame: number;
    fromFrame: number;
    toFrame: number;
    groupIndex: number;
    groupNames: string[];
}

export interface AnimationControlsController {
    togglePlayback: () => void;
    setFrame: (frame: number) => void;
    setGroupIndex: (groupIndex: number) => void;
}
