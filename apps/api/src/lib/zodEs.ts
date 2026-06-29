import { z } from "zod";

/**
 * Mapa de errores de Zod en español neutro.
 * Se registra una sola vez al arrancar el servidor (en index.ts).
 */
const zodEs: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === "undefined" || issue.received === "null")
        return { message: "Este campo es obligatorio" };
      return { message: `Se esperaba ${typeEs(issue.expected)}, se recibió ${typeEs(issue.received)}` };

    case z.ZodIssueCode.too_small:
      if (issue.type === "string") {
        if (issue.minimum === 1) return { message: "Este campo es obligatorio" };
        return { message: `Mínimo ${issue.minimum} carácter${issue.minimum === 1 ? "" : "es"}` };
      }
      if (issue.type === "number") {
        return { message: `Debe ser mayor o igual a ${issue.minimum}` };
      }
      if (issue.type === "array") {
        return { message: `Debe tener al menos ${issue.minimum} elemento${issue.minimum === 1 ? "" : "s"}` };
      }
      return { message: `Valor mínimo: ${issue.minimum}` };

    case z.ZodIssueCode.too_big:
      if (issue.type === "string") {
        return { message: `Máximo ${issue.maximum} carácter${issue.maximum === 1 ? "" : "es"}` };
      }
      if (issue.type === "number") {
        return { message: `Debe ser menor o igual a ${issue.maximum}` };
      }
      if (issue.type === "array") {
        return { message: `Máximo ${issue.maximum} elemento${issue.maximum === 1 ? "" : "s"}` };
      }
      return { message: `Valor máximo: ${issue.maximum}` };

    case z.ZodIssueCode.invalid_string:
      if (issue.validation === "email")   return { message: "Correo electrónico inválido" };
      if (issue.validation === "url")     return { message: "URL inválida" };
      if (issue.validation === "uuid")    return { message: "ID inválido" };
      if (issue.validation === "regex")   return { message: "Formato inválido" };
      if (issue.validation === "datetime") return { message: "Fecha y hora inválidas" };
      return { message: "Formato de texto inválido" };

    case z.ZodIssueCode.invalid_enum_value:
      return { message: `Valor no permitido. Opciones: ${issue.options.join(", ")}` };

    case z.ZodIssueCode.not_multiple_of:
      return { message: `Debe ser múltiplo de ${issue.multipleOf}` };

    case z.ZodIssueCode.not_finite:
      return { message: "Debe ser un número finito" };

    case z.ZodIssueCode.invalid_intersection_types:
      return { message: "Los tipos no son compatibles" };

    case z.ZodIssueCode.unrecognized_keys:
      return { message: `Campos no reconocidos: ${issue.keys.join(", ")}` };

    case z.ZodIssueCode.invalid_union:
      return { message: "Valor inválido" };

    case z.ZodIssueCode.invalid_date:
      return { message: "Fecha inválida" };

    case z.ZodIssueCode.custom:
      return { message: issue.message ?? "Valor inválido" };

    default:
      return { message: ctx.defaultError };
  }
};

function typeEs(t: string): string {
  const map: Record<string, string> = {
    string:    "texto",
    number:    "número",
    boolean:   "booleano",
    object:    "objeto",
    array:     "lista",
    null:      "nulo",
    undefined: "indefinido",
    integer:   "número entero",
    float:     "número decimal",
    bigint:    "entero grande",
    date:      "fecha",
    symbol:    "símbolo",
    function:  "función",
    nan:       "NaN",
    never:     "never",
    unknown:   "desconocido",
    void:      "void",
    map:       "mapa",
    set:       "conjunto",
    promise:   "promesa",
  };
  return map[t] ?? t;
}

export function registerZodEs() {
  z.setErrorMap(zodEs);
}
