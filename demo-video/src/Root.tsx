import { Composition } from "remotion";
import { DemoVideo, TOTAL } from "./DemoVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="DevContestDemo"
      component={DemoVideo}
      durationInFrames={TOTAL}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ bgm: true }}
    />
  );
};
