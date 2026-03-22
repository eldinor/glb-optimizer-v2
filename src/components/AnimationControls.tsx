import type { AnimationControlsController, AnimationControlsState } from "./AnimationControls.types";
import { Button, Field, Select, Slider } from "@fluentui/react-components";
import { PauseRegular, PlayRegular } from "@fluentui/react-icons";
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
            <Button className="animationControlsButton" appearance="secondary" onClick={props.controller.togglePlayback}>
                {state.isPlaying ? <PauseRegular /> : <PlayRegular />}
                {state.isPlaying ? "Pause" : "Play"}
            </Button>
            <Slider
                className="animationControlsSlider"
                min={state.fromFrame}
                max={state.toFrame}
                step={0.01}
                value={Number.isFinite(state.currentFrame) ? state.currentFrame : state.fromFrame}
                onChange={(_event, data) => props.controller.setFrame(Number(data.value))}
            />
            {state.groupNames.length > 1 ? (
                <Field className="animationControlsSelect" label="Animation">
                    <Select value={String(state.groupIndex)} onChange={(event) => props.controller.setGroupIndex(Number(event.target.value))}>
                        {state.groupNames.map((groupName, index) => (
                            <option key={`${groupName}-${index}`} value={index}>
                                {groupName || `Animation ${index + 1}`}
                            </option>
                        ))}
                    </Select>
                </Field>
            ) : null}
        </div>
    );
}
