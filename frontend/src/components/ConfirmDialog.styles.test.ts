/**
 * Issue #15: contraste (WCAG AA) y diseño adaptable del diálogo de eliminar. jsdom no calcula
 * estilos de hojas CSS, así que se lee `ConfirmDialog.module.css` y los tokens como texto y se
 * resuelven los pares de color con las variables reales.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'ConfirmDialog.module.css'), 'utf8');
const tokensCss = readFileSync(join(import.meta.dirname, '../styles/tokens.css'), 'utf8');

type Rgb = [number, number, number];

const tokens = new Map<string, string>(
  Array.from(tokensCss.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g), (match) => [
    match[1],
    match[2].replace(/\/\*.*?\*\//g, '').trim(),
  ]),
);

function resolve(value: string): string {
  const match = /^var\((--[\w-]+)\)$/.exec(value.trim());
  if (!match) return value.trim();
  const token = tokens.get(match[1]);
  if (token === undefined) throw new Error(`Token sin definir: ${match[1]}`);
  return resolve(token);
}

function toRgb(value: string): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(resolve(value));
  if (!hex) throw new Error(`Color no soportado: ${value}`);
  const n = parseInt(hex[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const v = channel / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** `opacity` sobre el fondo del diálogo: así se ve un control atenuado. */
function fade(color: Rgb, backdrop: Rgb, opacity: number): Rgb {
  return color.map((channel, index) => channel * opacity + backdrop[index] * (1 - opacity)) as Rgb;
}

/** Declaraciones de las reglas cuyo selector es exactamente `selector` (fuera de `@media`). */
function declarations(selector: string): Record<string, string> {
  const result: Record<string, string> = {};
  const withoutComments = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Sin los bloques `@media`: aquí se leen solo los estilos base (los de celular).
    .replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(',').map((part) => part.trim());
    if (!selectors.includes(selector)) continue;
    for (const line of match[2].split(';')) {
      const [property, ...value] = line.split(':');
      if (property.trim() && value.length > 0) result[property.trim()] = value.join(':').trim();
    }
  }
  return result;
}

const surface = toRgb('var(--color-surface)');

describe('contraste del diálogo de eliminar (WCAG AA)', () => {
  it('la prueba lee los estilos reales (si no, pasaría sin comprobar nada)', () => {
    expect(declarations('.confirm').background).toBe('var(--color-danger)');
    expect(declarations('.confirm:disabled').opacity).toBe('0.8');
    expect(contrast(toRgb('#000000'), toRgb('#ffffff'))).toBeCloseTo(21, 5);
  });

  it('Eliminar en reposo: texto blanco sobre rojo, al menos 4.5:1', () => {
    const { color, background } = declarations('.confirm');
    expect(contrast(toRgb(color), toRgb(background))).toBeGreaterThanOrEqual(4.5);
  });

  it('Eliminar con el cursor encima (hover) sigue por encima de 4.5:1', () => {
    const hover = declarations('.confirm:hover');
    expect(
      contrast(toRgb(declarations('.confirm').color), toRgb(hover.background)),
    ).toBeGreaterThanOrEqual(4.5);
    // El borde toma el mismo color que el fondo: el botón no cambia de tamaño visual al pasar el cursor.
    expect(hover['border-color']).toBe(hover.background);
  });

  it('"Eliminando…" (deshabilitado con opacidad) se sigue leyendo: al menos 4.5:1', () => {
    const base = declarations('.confirm');
    const opacity = Number(declarations('.confirm:disabled').opacity);
    const background = fade(toRgb(base.background), surface, opacity);
    const text = fade(toRgb(base.color), surface, opacity);
    expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
  });

  it('"Eliminando…" con el cursor encima mantiene el mismo contraste', () => {
    const base = declarations('.confirm');
    const hover = declarations('.confirm:disabled:hover');
    const opacity = Number(declarations('.confirm:disabled').opacity);
    const background = fade(toRgb(hover.background), surface, opacity);
    const text = fade(toRgb(base.color), surface, opacity);
    expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
  });

  it('el mensaje de error: texto sobre su fondo suave al menos 4.5:1, y la franja lateral al menos 3:1', () => {
    const error = declarations('.error');
    expect(contrast(toRgb(error.color), toRgb(error.background))).toBeGreaterThanOrEqual(4.5);
    const stripe = /solid\s+(var\(--[\w-]+\)|#[0-9a-f]{6})/i.exec(error['border-left'])?.[1] ?? '';
    expect(contrast(toRgb(stripe), toRgb(error.background))).toBeGreaterThanOrEqual(3);
  });

  it('título, descripción y Cancelar (reposo y hover) sobre el diálogo: al menos 4.5:1', () => {
    expect(contrast(toRgb('var(--color-text)'), surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(toRgb(declarations('.description').color), surface)).toBeGreaterThanOrEqual(
      4.5,
    );
    const cancel = declarations('.cancel');
    expect(contrast(toRgb(cancel.color), toRgb(cancel.background))).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(toRgb(cancel.color), toRgb(declarations('.cancel:hover').background)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('el borde de Cancelar y el anillo de foco contrastan al menos 3:1 con el diálogo (WCAG 1.4.11)', () => {
    const border =
      /solid\s+(var\(--[\w-]+\)|#[0-9a-f]{6})/i.exec(declarations('.cancel').border)?.[1] ?? '';
    expect(contrast(toRgb(border), surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(toRgb('var(--color-focus)'), surface)).toBeGreaterThanOrEqual(3);
    // El anillo (global.css) tiene separación de 2 px: se apoya en el diálogo, no sobre el botón rojo.
    const global = readFileSync(join(import.meta.dirname, '../styles/global.css'), 'utf8');
    expect(global).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--color-focus\)/);
    expect(global).toMatch(/:focus-visible\s*\{[^}]*outline-offset:\s*2px/);
  });

  it('Cancelar deshabilitado (exento de WCAG 1.4.3) sigue siendo legible: al menos 3:1', () => {
    const cancel = declarations('.cancel');
    const opacity = Number(declarations('.cancel:disabled').opacity);
    const text = fade(toRgb(cancel.color), surface, opacity);
    expect(contrast(text, surface)).toBeGreaterThanOrEqual(3);
  });
});

describe('diseño adaptable del diálogo', () => {
  it('a 375 px los botones se apilan: la fila solo empieza en 30rem (480 px)', () => {
    expect(declarations('.actions')['flex-direction']).toBe('column');
    const media = /@media\s*\(min-width:\s*([\d.]+)rem\)\s*\{[^@]*?\.actions\s*\{([^}]*)\}/.exec(
      css,
    );
    expect(media).not.toBeNull();
    expect(Number(media?.[1]) * 16).toBeGreaterThan(375);
    expect(media?.[2]).toContain('flex-direction: row');
  });

  it('los botones miden al menos 44 px de alto', () => {
    expect(declarations('.cancel')['min-height']).toBe('var(--touch-target)');
    expect(declarations('.confirm')['min-height']).toBe('var(--touch-target)');
    expect(Number.parseFloat(resolve('var(--touch-target)')) * 16).toBeGreaterThanOrEqual(44);
  });

  it('el diálogo cabe en 375 px: ancho 100 % con tope, margen del fondo y scroll propio si es alto', () => {
    const dialog = declarations('.dialog');
    expect(dialog.width).toBe('100%');
    expect(Number.parseFloat(dialog['max-width']) * 16).toBeLessThanOrEqual(480);
    expect(dialog['max-height']).toBe('100%');
    expect(dialog['overflow-y']).toBe('auto');
    const overlay = declarations('.overlay');
    expect(overlay.position).toBe('fixed');
    expect(overlay.inset).toBe('0');
    expect(overlay.padding).toBe('var(--space-4)');
    // 375 - 2 × 16 px de margen = 343 px de diálogo, menos que su tope.
    expect(375 - 2 * Number.parseFloat(resolve('var(--space-4)')) * 16).toBeLessThanOrEqual(
      Number.parseFloat(dialog['max-width']) * 16,
    );
  });

  it('un nombre largo sin espacios no desborda: título, descripción y error rompen en cualquier punto', () => {
    for (const selector of ['.title', '.description', '.error']) {
      expect(declarations(selector)['overflow-wrap'], selector).toBe('anywhere');
    }
  });

  it('el diálogo queda sobre la página pero debajo del aviso', () => {
    const toast = readFileSync(join(import.meta.dirname, 'ToastProvider.module.css'), 'utf8');
    const overlayZ = Number(declarations('.overlay')['z-index']);
    const toastZ = Number(/z-index:\s*(\d+)/.exec(toast)?.[1]);
    expect(overlayZ).toBeGreaterThan(0);
    expect(toastZ).toBeGreaterThan(overlayZ);
  });
});
