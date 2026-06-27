// ══════════════════════════════════════════════════════════════
//   imageUtils.ts — Utilidades de imagen para toda la app
//
//   Uso:
//     import { compressFile } from "@/lib/imageUtils";
//
//     const result = await compressFile(file, { maxMB: 1 });
//     // result.data   → base64 data URL lista para mostrar / guardar
//     // result.name   → nombre del archivo (normalizado a .jpg si fue comprimida)
//     // result.bytes  → tamaño final en bytes
//
//   Para imágenes: comprime con canvas (JPEG) hasta quedar bajo maxMB.
//   Para PDFs y otros: valida solo el tamaño, sin modificar el contenido.
// ══════════════════════════════════════════════════════════════

export interface CompressedFile {
  name:  string;
  data:  string;   // base64 data URL
  bytes: number;
  wasCompressed: boolean;
}

export interface CompressOptions {
  /** Tamaño máximo en MB (default 1) */
  maxMB?: number;
  /** Dimensión máxima en píxeles (default 1920) */
  maxDimension?: number;
  /** Calidad JPEG inicial 0-1 (default 0.85) */
  quality?: number;
}

/** Calcula bytes reales a partir de un data URL base64 */
function base64Bytes(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] ?? "";
  const padding = (base64.match(/=/g) ?? []).length;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Comprime una imagen o valida el tamaño de un PDF.
 * Lanza un Error si el archivo supera maxMB y no puede comprimirse.
 */
export function compressFile(
  file: File,
  opts: CompressOptions = {},
): Promise<CompressedFile> {
  const { maxMB = 1, maxDimension = 1920, quality: initQuality = 0.85 } = opts;
  const maxBytes = maxMB * 1024 * 1024;

  // ── Archivos que no son imagen (PDF, etc.) ──────────────────
  if (!file.type.startsWith("image/")) {
    if (file.size > maxBytes) {
      return Promise.reject(
        new Error(`El archivo "${file.name}" supera ${maxMB}MB (${(file.size / 1024 / 1024).toFixed(1)}MB). Solo se admiten PDFs menores a ${maxMB}MB.`),
      );
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const data = e.target?.result as string;
        resolve({ name: file.name, data, bytes: file.size, wasCompressed: false });
      };
      reader.onerror = () => reject(new Error("Error al leer el archivo."));
      reader.readAsDataURL(file);
    });
  }

  // ── Imágenes: comprimir con canvas ──────────────────────────
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      // 1. Calcular nuevas dimensiones si es necesario
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
      }

      // 2. Dibujar en canvas
      const canvas = document.createElement("canvas");
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("No se pudo crear el contexto canvas.")); return; }
      ctx.drawImage(img, 0, 0, width, height);

      // 3. Comprimir iterativamente hasta quedar bajo maxBytes
      let quality = initQuality;
      let data    = canvas.toDataURL("image/jpeg", quality);
      const originalBytes = base64Bytes(data);
      let wasCompressed = false;

      while (base64Bytes(data) > maxBytes && quality > 0.05) {
        quality     -= 0.08;
        data         = canvas.toDataURL("image/jpeg", Math.max(quality, 0.05));
        wasCompressed = true;
      }

      const finalBytes = base64Bytes(data);
      if (finalBytes > maxBytes) {
        reject(
          new Error(
            `La imagen no pudo comprimirse a menos de ${maxMB}MB. Intenta con una imagen más pequeña.`,
          ),
        );
        return;
      }

      // Normalizar nombre a .jpg
      const name = file.name.replace(/\.[^.]+$/, ".jpg");

      resolve({ name, data, bytes: finalBytes, wasCompressed: wasCompressed || originalBytes !== finalBytes });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No se pudo cargar la imagen."));
    };

    img.src = objectUrl;
  });
}

/** Formatea bytes en KB o MB para mostrar en UI */
export function fmtFileSize(bytes: number): string {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
