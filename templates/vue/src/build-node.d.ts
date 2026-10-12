// Narrow types for the trusted build configuration. Keep D05 dependencies locked;
// no Node APIs are made available in the generated browser runtime.
declare module 'node:crypto' {
  interface Hash { update(bytes: Uint8Array): Hash; digest(encoding: 'hex'): string }
  export function createHash(algorithm: 'sha256'): Hash
}
declare module 'node:fs/promises' {
  export function readdir(path: string): Promise<string[]>
  export function readFile(path: string): Promise<Uint8Array>
}
declare module 'node:path' {
  export function resolve(...paths: string[]): string
}
