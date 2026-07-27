export interface CameraPose {
  eye: [number, number, number];
  target: [number, number, number];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function interpolateCamera(progress: number, from: CameraPose, to: CameraPose): CameraPose {
  const t = Math.min(Math.max(progress, 0), 1);
  return {
    eye: [lerp(from.eye[0], to.eye[0], t), lerp(from.eye[1], to.eye[1], t), lerp(from.eye[2], to.eye[2], t)],
    target: [
      lerp(from.target[0], to.target[0], t),
      lerp(from.target[1], to.target[1], t),
      lerp(from.target[2], to.target[2], t),
    ],
  };
}
