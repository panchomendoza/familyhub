import { Resend } from "resend";

const resend = new Resend(process.env["RESEND_API_KEY"]);

// SEND_EMAILS=true  → envía a todos (o a los de DEV_REAL_EMAILS si está definido)
// SEND_EMAILS=false → solo console.log (default en development)
// DEV_REAL_EMAILS   → lista separada por comas; solo esos reciben email real, los demás ven el código en logs
const IS_PROD = process.env["NODE_ENV"] === "production";
const SEND_EMAILS = process.env["SEND_EMAILS"] === "true";
const DEV_REAL_EMAILS = (process.env["DEV_REAL_EMAILS"] ?? "")
  .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

function shouldSendTo(email: string): boolean {
  // SEND_EMAILS=false siempre deshabilita el envío, sin importar el entorno
  if (!SEND_EMAILS) return false;
  if (IS_PROD) return true;
  if (DEV_REAL_EMAILS.length > 0) return DEV_REAL_EMAILS.includes(email.toLowerCase());
  return true;
}

const FROM = `${process.env["RESEND_FROM_NAME"] ?? "FamilyHub"} <${process.env["RESEND_FROM_EMAIL"] ?? "onboarding@resend.dev"}>`;
const FRONTEND_URL = process.env["FRONTEND_URL"] ?? "http://localhost:5173";

// ── Logger de emails ──────────────────────────────────────────────────────────
function logEmail(type: string, to: string, result: "skipped" | "sent" | "error", detail?: string) {
  const tag   = { skipped: "⏭️ ", sent: "✅", error: "❌" }[result];
  const color = { skipped: "\x1b[33m", sent: "\x1b[32m", error: "\x1b[31m" }[result];
  const reset = "\x1b[0m";
  const msg   = detail ? ` — ${detail}` : "";
  console.log(`${color}${tag} [email:${type}] → ${to}${msg}${reset}`);
}

// ── Email: verificación de cuenta ──
export async function sendVerificationEmail({
  to,
  name,
  code,
}: {
  to:   string;
  name: string;
  code: string;
}) {
  if (!shouldSendTo(to)) {
    logEmail("verify", to, "skipped", `código: ${code}`);
    return;
  }

  const { data, error } = await resend.emails.send({
    from:    FROM,
    to:      [to],
    subject: `${code} — Tu código de verificación FamilyHub`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#F0F4FF;font-family:'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#4F7BF7,#A44FF7);padding:32px;text-align:center;">
              <div style="font-size:36px;">🏠</div>
              <div style="color:#ffffff;font-size:22px;font-weight:800;margin-top:8px;">FamilyHub</div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="color:#1A2340;font-size:16px;margin:0 0 8px;">Hola <strong>${escapeHtml(name)}</strong>,</p>
              <p style="color:#8A93A8;font-size:14px;margin:0 0 28px;">Usa este código para verificar tu cuenta. Expira en 15 minutos.</p>

              <!-- Código -->
              <div style="background:#F0F4FF;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
                <div style="font-size:42px;font-weight:800;letter-spacing:12px;color:#4F7BF7;font-family:monospace;">
                  ${escapeHtml(code)}
                </div>
              </div>

              <p style="color:#8A93A8;font-size:12px;margin:0;">
                Si no solicitaste este código, ignora este mensaje.<br/>
                Nunca compartas este código con nadie.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #E8EEFF;">
              <p style="color:#C0C8D8;font-size:11px;margin:0;text-align:center;">
                FamilyHub · Tu hogar, todo organizado<br/>
                <a href="${FRONTEND_URL}" style="color:#4F7BF7;text-decoration:none;">${FRONTEND_URL}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  });

  if (error) {
    logEmail("verify", to, "error", error.message);
    throw new Error("No se pudo enviar el email de verificación");
  }
  logEmail("verify", to, "sent", `id:${data?.id}`);
}

// ── Email: recuperación de contraseña ──
export async function sendPasswordResetEmail({
  to,
  name,
  code,
}: {
  to:   string;
  name: string;
  code: string;
}) {
  if (!shouldSendTo(to)) {
    logEmail("reset", to, "skipped", `código: ${code}`);
    return;
  }

  const { data, error } = await resend.emails.send({
    from:    FROM,
    to:      [to],
    subject: `${code} — Recupera tu contraseña de FamilyHub`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#F0F4FF;font-family:'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#4F7BF7,#A44FF7);padding:32px;text-align:center;">
              <div style="font-size:36px;">🔒</div>
              <div style="color:#ffffff;font-size:22px;font-weight:800;margin-top:8px;">Recuperar contraseña</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="color:#1A2340;font-size:16px;margin:0 0 8px;">Hola <strong>${escapeHtml(name)}</strong>,</p>
              <p style="color:#8A93A8;font-size:14px;margin:0 0 28px;">
                Usa este código para recuperar tu contraseña. Expira en 15 minutos.
              </p>
              <div style="background:#F0F4FF;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
                <div style="font-size:42px;font-weight:800;letter-spacing:12px;color:#4F7BF7;font-family:monospace;">
                  ${escapeHtml(code)}
                </div>
              </div>
              <p style="color:#8A93A8;font-size:12px;margin:0;">
                Si no solicitaste este código, ignora este mensaje.<br/>
                Por seguridad, nunca compartas este código con nadie.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #E8EEFF;">
              <p style="color:#C0C8D8;font-size:11px;margin:0;text-align:center;">
                FamilyHub · Tu hogar, todo organizado
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  });

  if (error) {
    logEmail("reset", to, "error", error.message);
    throw new Error("No se pudo enviar el email");
  }
  logEmail("reset", to, "sent", `id:${data?.id}`);
}

// ── Email: invitación a familia ──
export async function sendFamilyInviteEmail({
  to,
  inviterName,
  familyName,
  inviteCode,
}: {
  to:          string;
  inviterName: string;
  familyName:  string;
  inviteCode:  string;
}) {
  const joinUrl = `${FRONTEND_URL}/join?code=${inviteCode}`;

  const { data, error } = await resend.emails.send({
    from:    FROM,
    to:      [to],
    subject: `${escapeHtml(inviterName)} te invitó a ${escapeHtml(familyName)} en FamilyHub`,
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F0F4FF;font-family:'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#34C78A,#4F7BF7);padding:32px;text-align:center;">
              <div style="font-size:36px;">👨‍👩‍👧‍👦</div>
              <div style="color:#ffffff;font-size:22px;font-weight:800;margin-top:8px;">${escapeHtml(familyName)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="color:#1A2340;font-size:16px;margin:0 0 16px;">
                <strong>${escapeHtml(inviterName)}</strong> te invitó a unirte al hogar <strong>${escapeHtml(familyName)}</strong> en FamilyHub.
              </p>
              <div style="background:#F0F4FF;border-radius:10px;padding:16px;text-align:center;margin-bottom:20px;">
                <div style="font-size:11px;color:#8A93A8;margin-bottom:6px;">TU CÓDIGO DE INVITACIÓN</div>
                <div style="font-size:28px;font-weight:800;letter-spacing:8px;color:#34C78A;font-family:monospace;">
                  ${escapeHtml(inviteCode)}
                </div>
              </div>
              <div style="text-align:center;margin-bottom:20px;">
                <a href="${escapeHtml(joinUrl)}"
                   style="background:#34C78A;color:#ffffff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
                  Unirme al hogar
                </a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  });

  if (error) logEmail("invite", to, "error", error.message);
  else        logEmail("invite", to, "sent",  `id:${data?.id}`);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
