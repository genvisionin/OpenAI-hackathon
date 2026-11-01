import * as THREE from 'three';

// Small, tileable hand-painted maps keep the city procedural while giving its
// large surfaces enough texture to read clearly at street level.
function paintTexture(size, paint, repeat = [1, 1]) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  paint(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function createLondonTextures() {
  const brick = paintTexture(256, (ctx, s) => {
    ctx.fillStyle = '#8b4d3d'; ctx.fillRect(0, 0, s, s);
    for (let row = 0; row < 16; row++) {
      const y = row * 16;
      ctx.fillStyle = row % 2 ? '#734034' : '#aa6350';
      ctx.fillRect(0, y, s, 1);
      for (let col = -1; col < 8; col++) {
        const x = col * 32 + (row % 2) * 16;
        ctx.fillStyle = ['#965541', '#a8614a', '#7b4538', '#b16b54'][(row * 7 + col + 16) % 4];
        ctx.fillRect(x + 1, y + 1, 30, 14);
        ctx.fillStyle = 'rgba(255,220,190,.12)'; ctx.fillRect(x + 2, y + 2, 28, 2);
      }
    }
    for (let i = 0; i < 700; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      ctx.fillStyle = `rgba(34,22,18,${Math.random() * 0.12})`;
      ctx.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
  }, [2, 2]);

  const stone = paintTexture(256, (ctx, s) => {
    ctx.fillStyle = '#b7a78e'; ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 32) {
      ctx.fillStyle = 'rgba(68,54,42,.17)'; ctx.fillRect(0, y, s, 1);
      for (let x = (y / 32 % 2) * 36; x < s; x += 72) {
        ctx.fillStyle = 'rgba(255,242,213,.13)'; ctx.fillRect(x + 2, y + 2, 68, 28);
        ctx.fillStyle = 'rgba(72,58,47,.12)'; ctx.fillRect(x, y + 31, 1, 1);
      }
    }
    for (let i = 0; i < 1500; i++) {
      ctx.fillStyle = `rgba(70,57,42,${Math.random() * 0.08})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  }, [2, 2]);

  const roof = paintTexture(256, (ctx, s) => {
    ctx.fillStyle = '#343a3d'; ctx.fillRect(0, 0, s, s);
    for (let y = -16; y < s; y += 16) {
      for (let x = -24 + ((y / 16) % 2) * 20; x < s; x += 40) {
        ctx.fillStyle = ['#3d4546', '#48504f', '#303738'][(x + y + 800) % 3];
        ctx.fillRect(x + 1, y + 1, 38, 14);
        ctx.strokeStyle = 'rgba(12,20,21,.35)'; ctx.strokeRect(x + 1, y + 1, 38, 14);
      }
    }
  }, [2, 2]);

  const grass = paintTexture(256, (ctx, s) => {
    ctx.fillStyle = '#557b45'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) {
      const hue = Math.random() > 0.5 ? '92,132,66' : '38,85,47';
      ctx.fillStyle = `rgba(${hue},${0.08 + Math.random() * 0.17})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1, 2 + Math.random() * 4);
    }
  }, [8, 8]);

  const water = paintTexture(256, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#286d76'); g.addColorStop(0.48, '#3b9294'); g.addColorStop(1, '#225764');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 520; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      ctx.strokeStyle = `rgba(190,230,213,${0.05 + Math.random() * 0.18})`;
      ctx.lineWidth = 1 + Math.random() * 2; ctx.beginPath();
      ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 5, y - 3, x + 12 + Math.random() * 20, y + Math.random() * 2); ctx.stroke();
    }
  }, [9, 30]);

  const waterNormal = paintTexture(256, (ctx, s) => {
    ctx.fillStyle = '#8080ff'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 850; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      const c = 105 + Math.random() * 45;
      ctx.strokeStyle = `rgb(${c},${c},255)`; ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 8, y - 3, x + 18 + Math.random() * 14, y + 1); ctx.stroke();
    }
  }, [9, 30]);

  return { brick, stone, roof, grass, water, waterNormal };
}
