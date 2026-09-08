import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface Scene3DProps {
  className?: string;
}

/**
 * A small decorative Three.js scene — a faceted, silver-metallic icosahedron
 * that slowly tumbles in place. Sized to its container (not the window), so
 * it can sit as an accent inside the Hero without taking it over. Renders
 * nothing if WebGL isn't available, and freezes on a single static frame
 * under prefers-reduced-motion rather than spinning forever.
 */
export default function Scene3D({ className = '' }: Scene3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (err) {
      console.error('3D rendering error:', err);
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 6);

    const geometry = new THREE.IcosahedronGeometry(1.6, 0);
    const material = new THREE.MeshStandardMaterial({
      color: 0xd4d6da,
      metalness: 0.85,
      roughness: 0.28,
      flatShading: true,
      emissive: 0x2a2d33,
      emissiveIntensity: 0.5,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const wireframe = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }),
    );
    mesh.add(wireframe);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.PointLight(0xffffff, 2.6);
    key.position.set(5, 4, 6);
    scene.add(key);
    const rim = new THREE.PointLight(0x9fb4d4, 1.3);
    rim.position.set(-4, -2, -3);
    scene.add(rim);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    function resize() {
      if (!container) return;
      const { clientWidth: w, clientHeight: h } = container;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    resize();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frameId: number | null = null;

    function renderFrame() {
      mesh.rotation.x += 0.0028;
      mesh.rotation.y += 0.0042;
      renderer.render(scene, camera);
      if (!reduceMotion) {
        frameId = requestAnimationFrame(renderFrame);
      }
    }
    renderFrame();

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      geometry.dispose();
      material.dispose();
      wireframe.geometry.dispose();
      (wireframe.material as THREE.Material).dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={containerRef} className={className} aria-hidden="true" />;
}
