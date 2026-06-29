export function FieldError({ msg }: { msg?: string | undefined }) {
  if (!msg) return null;
  return <p className="text-[var(--danger-text)] text-xs mt-1 font-semibold">{msg}</p>;
}
