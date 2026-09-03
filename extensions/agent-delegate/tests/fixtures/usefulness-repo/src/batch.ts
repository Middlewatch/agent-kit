export function total(items: number[]): number {
  let sum = 0;
  for (let index = 0; index <= items.length; index += 1) {
    sum += items[index];
  }
  return sum;
}
