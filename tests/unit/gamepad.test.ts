import { afterEach, describe, expect, it, vi } from 'vitest';
import { kindOf, padActive, padKind, pollGamepad, pushPadHandler, type PadEvent } from '../../src/input/gamepad';

function fakePad(id: string) {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false }));
  const axes = [0, 0, 0, 0];
  return { id, index: 0, connected: true, buttons, axes, mapping: 'standard', timestamp: 0 };
}

describe('manette', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reconnaît une manette Xbox ou PlayStation', () => {
    expect(kindOf('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)')).toBe('xbox');
    expect(kindOf('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('ps');
    expect(kindOf('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)')).toBe('ps');
    expect(kindOf('Manette inconnue')).toBe('xbox');
  });

  it('un appui = un seul événement ; le stick gauche sert aussi à se déplacer dans les menus', () => {
    const pad = fakePad('DualSense Wireless Controller (Vendor: 054c)');
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const got: PadEvent[] = [];
    const off = pushPadHandler((e) => (got.push(e), true));
    pad.buttons[0].pressed = true;
    pollGamepad(1 / 60);
    pollGamepad(1 / 60);
    expect(got).toEqual(['a']);
    expect(padActive.value).toBe(true);
    expect(padKind.value).toBe('ps');
    pad.buttons[0].pressed = false;
    pad.axes[1] = 0.9;
    pollGamepad(1 / 60);
    expect(got).toEqual(['a', 'nav-down']);
    // On garde le stick : ça répète après un petit moment.
    for (let k = 0; k < 30; k++) pollGamepad(1 / 60);
    expect(got.filter((e) => e === 'nav-down').length).toBeGreaterThan(1);
    off();
  });

  it('zone morte : un stick à peine touché ne bouge rien, la gâchette compte comme un bouton', () => {
    const pad = fakePad('Xbox Controller');
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const got: PadEvent[] = [];
    const off = pushPadHandler((e) => (got.push(e), true));
    pad.axes[2] = 0.08;
    pad.buttons[7].value = 0.8;
    const s = pollGamepad(1 / 60)!;
    expect(s.rx).toBe(0);
    expect(s.rt).toBeCloseTo(0.8);
    expect(got).toContain('rt');
    off();
  });
});
