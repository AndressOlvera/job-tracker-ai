/**
 * Id de la ruta como número, o `undefined` si no es un entero positivo. Solo se aceptan dígitos
 * sin ceros a la izquierda: `abc`, `0`, `-1`, `1.5`, `1e3` y `2 ` nunca llegan a la API
 * (pedir `/applications/NaN` sería una petición inútil).
 */
export function parseApplicationId(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : undefined;
}
