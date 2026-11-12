import React from 'react';
import {Composition} from 'remotion';
import {KineticViewer, FPS, FRAMES, H4, W4} from './Viewer';

// 3840×2160 · 60fps · 길이 = timeline.json 의 T(초)
export const Root: React.FC = () => (<>
  <Composition id="KineticViewer" component={KineticViewer} durationInFrames={FRAMES} fps={FPS} width={W4} height={H4} />
</>);
