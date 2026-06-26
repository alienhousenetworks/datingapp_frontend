export const LAPTOP_MIN_WIDTH = 1000;

export function isLaptopUp() {
  return window.innerWidth >= LAPTOP_MIN_WIDTH;
}

export function isCompactNav() {
  return window.innerWidth < LAPTOP_MIN_WIDTH;
}
