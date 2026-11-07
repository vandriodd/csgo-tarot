import * as THREE from 'three';
import type { Arcanum } from '../data/arcana';
import { backTexture, cardAlpha, CARD_PX, frontTexture } from '../textures';

/** World size of a card, in meters. Keeps the Procreate aspect ratio. */
export const CARD_H = 0.36;
export const CARD_W = (CARD_H * CARD_PX.w) / CARD_PX.h;

const geometry = new THREE.PlaneGeometry(CARD_W, CARD_H);

/**
 * A two-sided card.
 *
 *   root   — position and yaw in the world. Rotated so local +Z points up when lying on a table.
 *   pivot  — flip (rotation.y), reversal (rotation.z) and lift (position.z).
 *
 * pivot.rotation.y === 0 shows the front, Math.PI shows the back.
 */
export class Card3D {
  readonly root = new THREE.Group();
  readonly pivot = new THREE.Group();
  readonly front: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshPhysicalMaterial>;
  readonly back: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  arcanum: Arcanum | null = null;

  /** `glossy` adds a clear-coat sheen; off on the table, where the lamp sits right above. */
  constructor({ lying = true, glossy = false } = {}) {
    const alphaMap = cardAlpha();
    this.front = new THREE.Mesh(
      geometry,
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        alphaMap,
        alphaTest: 0.5,
        roughness: glossy ? 0.62 : 0.85,
        clearcoat: glossy ? 0.35 : 0,
        clearcoatRoughness: 0.4,
      }),
    );
    this.back = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ map: backTexture(), alphaMap, alphaTest: 0.5, roughness: 0.7 }),
    );
    this.front.position.z = 0.0008;
    this.back.position.z = -0.0008;
    this.back.rotation.y = Math.PI;
    for (const m of [this.front, this.back]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.card = this;
    }
    this.pivot.add(this.front, this.back);
    this.root.add(this.pivot);
    if (lying) this.root.rotation.x = -Math.PI / 2;
    this.showBack();
  }

  async setArcanum(card: Arcanum) {
    this.arcanum = card;
    const tex = await frontTexture(card);
    if (this.arcanum !== card) return; // changed while loading
    this.front.material.map = tex;
    this.front.material.needsUpdate = true;
  }

  showBack() {
    this.pivot.rotation.set(0, Math.PI, 0);
  }

  get meshes() {
    return [this.front, this.back];
  }
}
