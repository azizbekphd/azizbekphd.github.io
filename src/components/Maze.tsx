import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { Hole } from './Hole';
import { useMemo, useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';

interface MazeProps {
  map: number[][];
  onNavigate: (path: string) => void;
}

const CELL_SIZE = 1;
const WALL_HEIGHT = 1.0;

const PORTAL_COLORS: Record<string, string> = {
    PROJECTS: "#00ccff",
    SKILLS: "#ff00ff",
    CONTACT: "#ffff00",
    ENDLESS: "#00ff88",
    NEXT: "#00ff88",
    HOME: "#ffffff",
    BACK: "#ffffff"
};

export function Maze({ map, onNavigate }: MazeProps) {
  const wallMeshRef = useRef<THREE.InstancedMesh>(null);
  const floorMeshRef = useRef<THREE.InstancedMesh>(null);

  const width = map[0].length;
  const height = map.length;

  const { wallVisuals, floorVisuals, collidersJSX, holesJSX } = useMemo(() => {
    const wallV: [number, number, number][] = [];
    const floorV: [number, number, number][] = [];
    
    map.forEach((row, z) => {
      row.forEach((cell, x) => {
        const cx = (x - width / 2) * CELL_SIZE + CELL_SIZE / 2;
        const cz = (z - height / 2) * CELL_SIZE + CELL_SIZE / 2;
        if (cell === 1) wallV.push([cx, WALL_HEIGHT / 2, cz]);
        else if (cell === 0 || cell === 9) floorV.push([cx, -0.05, cz]);
      });
    });

    const getMergedColliders = (types: number[]) => {
      const colliders: any[] = [];
      const visited = Array(height).fill(0).map(() => Array(width).fill(false));
      for (let z = 0; z < height; z++) {
        for (let x = 0; x < width; x++) {
          if (types.includes(map[z][x]) && !visited[z][x]) {
            let w = 1;
            while (x + w < width && types.includes(map[z][x + w]) && !visited[z][x + w]) w++;
            let h = 1;
            while (z + h < height) {
              let possible = true;
              for (let i = 0; i < w; i++) if (!types.includes(map[z + h][x + i]) || visited[z + h][x + i]) { possible = false; break; }
              if (possible) h++; else break;
            }
            for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) visited[z + i][x + j] = true;
            const midX = x + (w - 1) / 2;
            const midZ = z + (h - 1) / 2;
            const cx = (midX - width / 2) * CELL_SIZE + CELL_SIZE / 2;
            const cz = (midZ - height / 2) * CELL_SIZE + CELL_SIZE / 2;
            colliders.push({ pos: [cx, 0, cz], args: [(w * CELL_SIZE) / 2, 0, (h * CELL_SIZE) / 2] });
          }
        }
      }
      return colliders;
    };

    const wallCollidersData = getMergedColliders([1]);
    const floorCollidersData = getMergedColliders([0, 9]);

    const colliders = (
      <>
        <RigidBody type="fixed" friction={0.1} restitution={0.2}>
          {wallCollidersData.map((c, i) => (
            <CuboidCollider key={`w-${i}`} args={[c.args[0], WALL_HEIGHT / 2, c.args[2]]} position={[c.pos[0], WALL_HEIGHT / 2, c.pos[2]]} />
          ))}
        </RigidBody>
        <RigidBody type="fixed" friction={0.1} restitution={0.2}>
          {floorCollidersData.map((c, i) => (
            <CuboidCollider key={`f-${i}`} args={[c.args[0], 0.5, c.args[2]]} position={[c.pos[0], -0.5, c.pos[2]]} />
          ))}
        </RigidBody>
      </>
    );

    const holes: any[] = [];
    map.forEach((row, z) => {
      row.forEach((cell, x) => {
        if (cell >= 2 && cell <= 8) {
          const cx = (x - width / 2) * CELL_SIZE + CELL_SIZE / 2;
          const cz = (z - height / 2) * CELL_SIZE + CELL_SIZE / 2;
          let route = "/"; let label = "";
          
          if (cell === 2) { route = "/projects"; label = "PROJECTS"; }
          if (cell === 3) { route = "/skills"; label = "SKILLS"; }
          if (cell === 4) { route = "/contact"; label = "CONTACT"; }
          if (cell === 5) {
            const randomSeed = Math.random().toString(36).substring(7);
            route = `/endless/${randomSeed}`;
            label = window.location.pathname.startsWith("/endless/") ? "NEXT" : "ENDLESS";
          }
          if (width === 10) { 
              if (cell === 2) { route = "/"; label = "BACK"; }
              if (cell === 3) { route = "/contact"; label = "CONTACT"; }
          }
          if (window.location.pathname.startsWith("/endless/")) {
              if (cell === 2) { route = "/"; label = "HOME"; }
          }
          
          holes.push(
            <Hole 
                key={`h-${x}-${z}`} 
                position={[cx, 0, cz]} 
                to={route} 
                onEnter={onNavigate} 
                label={label} 
                color={PORTAL_COLORS[label] || "#ffffff"}
            />
          );
        }
      });
    });

    return { wallVisuals: wallV, floorVisuals: floorV, collidersJSX: colliders, holesJSX: holes };
  }, [map, width, height, onNavigate]);

  useLayoutEffect(() => {
    const temp = new THREE.Object3D();
    if (wallMeshRef.current) {
      wallVisuals.forEach((pos, i) => {
        temp.position.set(...pos);
        temp.updateMatrix();
        wallMeshRef.current!.setMatrixAt(i, temp.matrix);
      });
      wallMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (floorMeshRef.current) {
      floorVisuals.forEach((pos, i) => {
        temp.position.set(...pos);
        temp.rotation.x = -Math.PI / 2;
        temp.updateMatrix();
        floorMeshRef.current!.setMatrixAt(i, temp.matrix);
      });
      floorMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [wallVisuals, floorVisuals]);

  return (
    <group>
      <instancedMesh ref={wallMeshRef} args={[null as any, null as any, wallVisuals.length]} castShadow receiveShadow>
        <boxGeometry args={[CELL_SIZE, WALL_HEIGHT, CELL_SIZE]} />
        <meshStandardMaterial color="#444444" metalness={0.2} roughness={0.8} />
      </instancedMesh>

      <instancedMesh ref={floorMeshRef} args={[null as any, null as any, floorVisuals.length]} receiveShadow>
        <planeGeometry args={[CELL_SIZE, CELL_SIZE]} />
        <meshStandardMaterial color="#ffffff" metalness={0.1} roughness={0.9} />
      </instancedMesh>

      {collidersJSX}
      {holesJSX}
    </group>
  );
}
