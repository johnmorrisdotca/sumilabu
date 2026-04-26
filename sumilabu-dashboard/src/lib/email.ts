import { Resend } from "resend";

type SendEmailOptions = {
  html: string;
  subject: string;
  text?: string;
  to: string[];
};

type SendEmailResult = {
  configured: boolean;
  emailId?: string;
  error?: string;
  provider: "resend";
  success: boolean;
};

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export function parseEmailList(raw?: string): string[] {
  return (raw || "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

export function isEmailConfigured(): boolean {
  return !!resend;
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  if (!resend) {
    console.warn("[email] Resend not configured (missing RESEND_API_KEY).");
    return {
      configured: false,
      error: "Email service not configured",
      provider: "resend",
      success: false,
    };
  }

  const from = process.env.EMAIL_FROM || "SumiLabu Telemetry <noreply@sumilabu.com>";

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    if (error) {
      console.error("[email] Resend error:", error);
      return {
        configured: true,
        error: error.message || "Failed to send email",
        provider: "resend",
        success: false,
      };
    }

    return {
      configured: true,
      emailId: data?.id,
      provider: "resend",
      success: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error sending email";
    console.error("[email] Unexpected error:", err);
    return {
      configured: true,
      error: message,
      provider: "resend",
      success: false,
    };
  }
}
