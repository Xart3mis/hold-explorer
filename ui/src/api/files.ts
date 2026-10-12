/** The file formats an import reads: the extensions the file dialog offers, in the order shown. */
export const IMPORT_EXTENSIONS = [
  "xlsx",
  "xlsm",
  "xlsb",
  "xls",
  "ods",
  "csv",
  "tsv",
  "txt",
] as const;

/** The name of a file without its folders, for a path written the Windows or the Linux way. */
export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
