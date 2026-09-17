// Ambient type declarations for Node runtime environments
interface Buffer extends Uint8Array {
  toString(encoding?: string): string;
}

declare var Buffer: {
  from(data: any, encoding?: string): Buffer;
  isBuffer(obj: any): boolean;
};

declare var process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exit(code?: number): never;
};

declare function fetch(input: any, init?: any): Promise<any>;
