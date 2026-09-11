export const PROJECT_COLORS = [
  '#6366f1', // indigo
  '#059669', // emerald
  '#d97706', // amber
  '#db2777', // pink
  '#0891b2', // cyan
  '#7c3aed', // violet
  '#dc2626', // red
  '#65a30d', // lime
]

export function nextColor(usedCount: number): string {
  return PROJECT_COLORS[usedCount % PROJECT_COLORS.length]
}
