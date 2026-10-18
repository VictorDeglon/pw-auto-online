/**
 * Procedural Scene Exporter
 * Exports the generated 3D architecture, interior, and landscape to Unreal Engine / Blender compatible GLB.
 */
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

export class SceneExporter {
  static exportToGLB(sceneOrObject, filename = 'poway_building.glb') {
    const exporter = new GLTFExporter();

    const options = {
      binary: true,
      truncateDrawRange: true,
      embedImages: true,
      onlyVisible: true
    };

    exporter.parse(
      sceneOrObject,
      (gltf) => {
        const blob = new Blob([gltf], { type: 'model/gltf-binary' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
      },
      (error) => {
        console.error('[AdRush Architect] Failed to export GLB:', error);
      },
      options
    );
  }
}
