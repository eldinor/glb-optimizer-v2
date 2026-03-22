import type { AnimationControlsController, AnimationControlsState } from "./AnimationControls.types";
import "./AnimationControls.css";

interface AnimationControlsProps {
    state: AnimationControlsState;
    controller: AnimationControlsController;
    className?: string;
}

export function AnimationControls(props: AnimationControlsProps) {
    const { state } = props;
    if (!state.hasAnimations) {
        return null;
    }

    return (
        <div className={props.className ? `animationControls ${props.className}` : "animationControls"} aria-label="Animation controls">
            <button className="animationControlsButton" type="button" onClick={props.controller.togglePlayback}>
                {state.isPlaying ? "Pause" : "Play"}
            </button>
            <input
                className="animationControlsSlider"
                type="range"
                min={state.fromFrame}
                max={state.toFrame}
                step="any"
                value={Number.isFinite(state.currentFrame) ? state.currentFrame : state.fromFrame}
                onChange={(event) => props.controller.setFrame(Number(event.target.value))}
            />
            {state.groupNames.length > 1 ? (
                <label className="animationControlsSelect">
                    <span>Animation</span>
                    <select value={state.groupIndex} onChange={(event) => props.controller.setGroupIndex(Number(event.target.value))}>
                        {state.groupNames.map((groupName, index) => (
                            <option key={`${groupName}-${index}`} value={index}>
                                {groupName || `Animation ${index + 1}`}
                            </option>
                        ))}
                    </select>
                </label>
            ) : null}
        </div>
    );
}
