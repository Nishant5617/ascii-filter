
export interface AsciiOptions {
  fontSize: number;
  brightness: number;
  contrast: number;
  colorMode: 'matrix' | 'bw' | 'color' | 'retro';
  density: 'simple' | 'complex' | 'binary' | 'blocks';
  resolution: number; // Downscaling factor (0.1 - 1.0)
}

export interface AnalysisResult {
  description: string;
  tags: string[];
  threatLevel: string;
}

export const DENSITY_MAPS = {
  simple: " .:-=+*#%@",
  complex: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczMW&8%Q$@#", 
  binary: " 01",
  blocks: " ░▒▓█",
};
