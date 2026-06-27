import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import type { Family } from "@familyhub/types";

type Step = "choice" | "create" | "join";

interface ErrBody { error?: string }
interface FamilyResponse { family?: Family; id?: string; name?: string; inviteCode?: string; members?: unknown[] }

export default function OnboardingPage() {
  const { user, setCurrentFamily, setFamilies, families } = useAuthStore();
  const navigate = useNavigate();

  const [step,       setStep]       = useState<Step>("choice");
  const [familyName, setFamilyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error,      setError]      = useState<string | null>(null);
  const [loading,    setLoading]    = useState(false);

  // ── Crear familia ──
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!familyName.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post<FamilyResponse>("/families", { name: familyName.trim() });
      const newFamily = data.family ?? (data as unknown as Family);
      const updated   = [...families, newFamily];
      setFamilies(updated);
      setCurrentFamily(newFamily);
      navigate("/home", { replace: true });
    } catch (err) {
      setError((err as ApiError<ErrBody>).data?.error ?? "No se pudo crear el hogar.");
    } finally {
      setLoading(false);
    }
  }

  // ── Unirse con código ──
  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const code = inviteCode.trim().toUpperCase();
    if (code.length !== 6) {
      setError("El código debe tener 6 caracteres.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post<FamilyResponse>("/families/join", { inviteCode: code });
      const joined  = data.family ?? (data as unknown as Family);
      const updated = [...families, joined];
      setFamilies(updated);
      setCurrentFamily(joined);
      navigate("/home", { replace: true });
    } catch (err) {
      const status = (err as ApiError).status;
      const msg    = (err as ApiError<ErrBody>).data?.error;
      if (status === 404) setError("Código no encontrado. Revísalo con quien te invitó.");
      else if (status === 409) setError("Ya eres miembro de ese hogar.");
      else setError(msg ?? "No se pudo unirse al hogar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Volver si ya tiene familia */}
        {families.length > 0 && (
          <button
            onClick={() => navigate("/home")}
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-6 transition"
          >
            ← Volver al inicio
          </button>
        )}

        {/* Header */}
        <div className="text-center mb-8">
          <span className="text-5xl">🏡</span>
          <h1 className="mt-3 text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            {user?.name ? `Hola, ${user.name.split(" ")[0]}!` : "¡Bienvenido!"}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {families.length > 0 ? "Crea o únete a otro hogar" : "Para empezar, crea o únete a un hogar"}
          </p>
        </div>

        {/* ── Elección inicial ── */}
        {step === "choice" && (
          <div className="space-y-3">
            <OptionCard
              emoji="✨"
              title="Crear un hogar nuevo"
              description="Tu eres el administrador y puedes invitar a tu familia"
              onClick={() => { setError(null); setStep("create"); }}
            />
            <OptionCard
              emoji="🔗"
              title="Unirme a un hogar existente"
              description="Usa el código de invitación que te compartieron"
              onClick={() => { setError(null); setStep("join"); }}
            />
          </div>
        )}

        {/* ── Crear hogar ── */}
        {step === "create" && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
            <button
              onClick={() => { setStep("choice"); setError(null); }}
              className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-5 transition"
            >
              ← Volver
            </button>

            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              Nuevo hogar
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              Elegí un nombre para tu hogar. Podés cambiarlo después.
            </p>

            {error && <ErrorBox message={error} />}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label
                  htmlFor="family-name"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  Nombre del hogar
                </label>
                <input
                  id="family-name"
                  type="text"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  disabled={loading}
                  placeholder="Ej: Familia García, Casa Norte…"
                  maxLength={80}
                  autoFocus
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition"
                />
              </div>
              <button
                type="submit"
                disabled={loading || familyName.trim().length < 2}
                className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 dark:disabled:bg-blue-800 text-white font-semibold py-2.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {loading ? "Creando…" : "Crear hogar"}
              </button>
            </form>
          </div>
        )}

        {/* ── Unirse con código ── */}
        {step === "join" && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
            <button
              onClick={() => { setStep("choice"); setError(null); }}
              className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-5 transition"
            >
              ← Volver
            </button>

            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              Unirse a un hogar
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              Pedile a un administrador el código de invitación de 6 caracteres.
            </p>

            {error && <ErrorBox message={error} />}

            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label
                  htmlFor="invite-code"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  Código de invitación
                </label>
                <input
                  id="invite-code"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  disabled={loading}
                  placeholder="Ej: AB12CD"
                  maxLength={6}
                  autoFocus
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 font-mono tracking-widest text-center text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition"
                />
                <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500 text-center">
                  Solo letras y números, sin espacios
                </p>
              </div>
              <button
                type="submit"
                disabled={loading || inviteCode.trim().length !== 6}
                className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 dark:disabled:bg-blue-800 text-white font-semibold py-2.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {loading ? "Uniéndome…" : "Unirme al hogar"}
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Sub-componentes ──

function OptionCard({
  emoji, title, description, onClick,
}: {
  emoji: string;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700 rounded-2xl p-5 transition group focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <div className="flex items-start gap-4">
        <span className="text-3xl leading-none mt-0.5">{emoji}</span>
        <div>
          <p className="font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition text-sm">
            {title}
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            {description}
          </p>
        </div>
        <span className="ml-auto text-gray-400 dark:text-gray-600 group-hover:text-blue-500 transition text-lg self-center">
          →
        </span>
      </div>
    </button>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
      {message}
    </div>
  );
}
