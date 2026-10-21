/** Limites de segurança do importador. Valores conservadores: metadados de fatiamento são pequenos. */

export const MAX_FILE_BYTES = 50 * 1024 * 1024; // alinhado ao limite do bucket de armazenamento

export const ZIP_LIMITS = {
  /** Máximo de entradas no diretório central do ZIP. */
  maxEntries: 5000,
  /** Tamanho máximo do diretório central. */
  maxCentralDirBytes: 8 * 1024 * 1024,
  /** Arquivos de texto/configuração (XML, JSON): bytes descompactados. */
  maxTextBytes: 2 * 1024 * 1024,
  /** Só o começo de `3D/3dmodel.model` é lido (os metadados vêm antes da geometria). */
  maxModelHeadBytes: 256 * 1024,
  /** Miniaturas PNG. */
  maxImageBytes: 2 * 1024 * 1024,
  /** Soma de tudo o que for descompactado de um mesmo arquivo. */
  maxTotalBytes: 16 * 1024 * 1024,
} as const;

/** G-code: só o começo e o fim do arquivo são lidos (o miolo são milhões de linhas de movimento). */
export const GCODE_HEAD_BYTES = 256 * 1024;
export const GCODE_TAIL_BYTES = 512 * 1024;
