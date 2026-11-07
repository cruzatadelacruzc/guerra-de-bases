import * as THREE from 'three';

/**
 * Rectangular equivalent of THREE.GridHelper (which is always square in r128)
 * so the grid covers the whole width x depth terrain. Lines through the
 * origin use `centerColor`, the rest `lineColor`; a single LineSegments draw.
 */
export function createTerrainGrid(
  width: number,
  depth: number,
  cellSize: number,
  centerColor: THREE.Color | string | number,
  lineColor: THREE.Color | string | number
): THREE.LineSegments {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const center = new THREE.Color(centerColor);
  const line = new THREE.Color(lineColor);
  const positions: number[] = [];
  const colors: number[] = [];

  const pushLine = (x1: number, z1: number, x2: number, z2: number, color: THREE.Color) => {
    positions.push(x1, 0, z1, x2, 0, z2);
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
  };

  const columns = Math.round(width / cellSize);
  for (let i = 0; i <= columns; i++) {
    const x = -halfWidth + i * cellSize;
    pushLine(x, -halfDepth, x, halfDepth, Math.abs(x) < 1e-6 ? center : line);
  }
  const rows = Math.round(depth / cellSize);
  for (let i = 0; i <= rows; i++) {
    const z = -halfDepth + i * cellSize;
    pushLine(-halfWidth, z, halfWidth, z, Math.abs(z) < 1e-6 ? center : line);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false });
  return new THREE.LineSegments(geometry, material);
}
