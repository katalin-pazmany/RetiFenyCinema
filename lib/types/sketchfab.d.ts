export {};

declare global {
  interface SketchfabViewerApi {
    start: () => void;
    addEventListener: (event: string, callback: (...args: unknown[]) => void) => void;
    getCameraLookAt: (callback: (err: Error | null, camera: { position: [number, number, number]; target: [number, number, number] }) => void) => void;
    setCameraLookAt: (
      eye: [number, number, number],
      target: [number, number, number],
      duration: number,
      callback?: (err: Error | null) => void,
    ) => void;
  }

  interface Window {
    Sketchfab?: new (
      version: string,
      iframe: HTMLIFrameElement,
    ) => {
      init: (
        uid: string,
        options: {
          success: (api: SketchfabViewerApi) => void;
          error: () => void;
          // Standard Sketchfab embed parameters, also accepted by the JS
          // Viewer API's init() options (mirrors the query-string params
          // documented for plain iframe embeds). Not exhaustive — add more
          // as needed.
          ui_theme?: 'dark';
          ui_hint?: 0 | 1 | 2;
        },
      ) => void;
    };
  }
}
