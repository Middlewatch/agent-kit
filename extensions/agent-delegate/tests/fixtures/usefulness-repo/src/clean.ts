export function slug(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, "-");
}
