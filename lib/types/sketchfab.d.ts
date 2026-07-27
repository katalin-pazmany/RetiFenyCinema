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
        options: { success: (api: SketchfabViewerApi) => void; error: () => void },
      ) => void;
    };
  }
}
