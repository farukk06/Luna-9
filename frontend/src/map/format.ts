/** Fixed decimals with a real minus sign, so negative Mars elevations read cleanly. */
export function formatNumber(value: number, decimals: number): string {
  return value.toFixed(decimals).replace('-', '−')
}
