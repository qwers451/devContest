import { Composition } from "remotion";
import { DemoVideo, TOTAL } from "./DemoVideo";
import { FPS } from "./time";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="DevContestDemo"
      component={DemoVideo}
      durationInFrames={TOTAL}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ bgm: true }}
    />
  );
};
