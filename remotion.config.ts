import {Config} from '@remotion/cli/config';
// three.js(WebGL) 장면을 윈도우에서도 그리게 · 4K 장면이 무거워 기다림을 넉넉히
Config.setChromiumOpenGlRenderer('angle');
Config.setDelayRenderTimeoutInMilliseconds(120000);
Config.setPixelFormat('yuv420p');
