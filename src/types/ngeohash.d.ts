declare module 'ngeohash' {
  export function encode(latitude: number | string, longitude: number | string, precision?: number): string;
  export function decode(hashstring: string): { latitude: number, longitude: number, error?: { latitude: number, longitude: number } };
  export function decode_bbox(hashstring: string): [number, number, number, number];
  export function bboxes(minlat: number, minlon: number, maxlat: number, maxlon: number, precision?: number): string[];
  export function neighbor(hashstring: string, direction: [number, number]): string;
  export function neighbors(hashstring: string): string[];
}