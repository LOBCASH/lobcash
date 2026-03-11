export interface Vector {
  x: number;
  y: number;
}

export function vAdd(a: Vector, b: Vector): Vector {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vSub(a: Vector, b: Vector): Vector {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function vScale(v: Vector, s: number): Vector {
  return { x: v.x * s, y: v.y * s };
}

export function vLength(v: Vector): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function vDistance(a: Vector, b: Vector): number {
  return vLength(vSub(a, b));
}

export function vNormalize(v: Vector): Vector {
  const len = vLength(v);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function vLerp(a: Vector, b: Vector, t: number): Vector {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function vClamp(v: Vector, minX: number, minY: number, maxX: number, maxY: number): Vector {
  return {
    x: Math.max(minX, Math.min(maxX, v.x)),
    y: Math.max(minY, Math.min(maxY, v.y)),
  };
}

export function vRandom(minX: number, minY: number, maxX: number, maxY: number): Vector {
  return {
    x: minX + Math.random() * (maxX - minX),
    y: minY + Math.random() * (maxY - minY),
  };
}

export function vRandomInCircle(center: Vector, radius: number): Vector {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * radius;
  return {
    x: center.x + Math.cos(angle) * r,
    y: center.y + Math.sin(angle) * r,
  };
}
