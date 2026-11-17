import { describe, expect, it } from 'vitest';
import { autoStartFor, lowerQuality, QUALITY_PRESETS } from '../../src/render/quality';

describe('qualité automatique', () => {
  it('démarre en Basse sur une puce Intel intégrée', () => {
    expect(autoStartFor('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('low');
    expect(autoStartFor('ANGLE (Intel, Intel(R) HD Graphics 520 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('low');
    expect(autoStartFor('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('low');
  });
  it('démarre en Haute sur une vraie carte graphique', () => {
    expect(autoStartFor('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('high');
    expect(autoStartFor('ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('high');
  });
  it('démarre en Minimale sans accélération graphique', () => {
    expect(autoStartFor('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')).toBe('minimal');
  });
  it('descend les niveaux dans l’ordre', () => {
    expect(lowerQuality('ultra')).toBe('high');
    expect(lowerQuality('low')).toBe('minimal');
    expect(lowerQuality('minimal')).toBeNull();
  });
  it('les niveaux bas sont bien allégés', () => {
    expect(QUALITY_PRESETS.minimal.shadowMap).toBe(0);
    expect(QUALITY_PRESETS.low.cheapMaterials).toBe(true);
    expect(QUALITY_PRESETS.minimal.pixelRatio).toBeLessThan(1);
  });
});
