import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import crypto from "node:crypto";

/**
 * Public X.509 Digital Certificate for RestroZ POS Printing System.
 * Note: Digital certificates contain ONLY the public key and identity metadata (CN=RestroZ POS, O=RestroZ Technologies).
 * It is completely safe to distribute publicly.
 */
const DEFAULT_PUBLIC_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIDoTCCAomgAwIBAgIUOBiazfCjA53dg+oaFSyDyRZcQXYwDQYJKoZIhvcNAQEL
BQAwYDEUMBIGA1UEAwwLUmVzdHJvWiBQT1MxHTAbBgNVBAoMFFJlc3Ryb1ogVGVj
aG5vbG9naWVzMRwwGgYDVQQLDBNQT1MgUHJpbnRpbmcgU3lzdGVtMQswCQYDVQQG
EwJJTjAeFw0yNjA5MjYyMzIzMjVaFw0zNjA5MjMyMzIzMjVaMGAxFDASBgNVBAMM
C1Jlc3Ryb1ogUE9TMR0wGwYDVQQKDBRSZXN0cm9aIFRlY2hub2xvZ2llczEcMBoG
A1UECwwTUE9TIFByaW50aW5nIFN5c3RlbTELMAkGA1UEBhMCSU4wggEiMA0GCSqG
SIb3DQEBAQUAA4IBDwAwggEKAoIBAQDnCWo/jjz2odnstyP7VEDrr1RjiIgTYDZF
cExo1W1nT7VBr/AmT+dMAnmRtPIF1s2pQnyWlaBp1wAWuwdr9e7I9QEq3XHZBqDp
gzxFXxKNptMN04uKG+RCAgZ5HyZGPyqXR8ksT4hDZ6/8ORxc29y7kkTPr2U/jxHX
YWOzQdsLbfYOxYpwdwAHw0fwNOm3UAwZuKJConqhOLj7oXj5OiCfCHUQK104Gdiy
ft1x0mWq59EEK/+/m3hidRTm7k4XHsXAwXh251Sl1LMeWDwoBggK+ZznRspF39NT
lxud5+s+u7H25JrUk36lkkDlGCYgMQnETx6rLNc7H6lapLM18PTLAgMBAAGjUzBR
MB0GA1UdDgQWBBR2TY1deR8hXuukLzTlYmR+3O87sDAfBgNVHSMEGDAWgBR2TY1d
eR8hXuukLzTlYmR+3O87sDAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUA
A4IBAQAJFif4qzMNkKAvDlbRIAmdHnZo6g2tK4rnJ+6PzSJ2brhk0nL5DW67RkPw
ugz0CGENf7LcnZBFtlAR+urABil4Ur/KgmbiUurHlvZcxj3bsMYslBfxZbpXrwkk
FrGfJMS8Mc/xvfQbrsHRYWQ3+TbAAdmRkvh5RMKa951gBYeniwIz1IagN7EkEhME
bSIP91mmRuLch4fTwwmH1hNJ0YR6kY5lTEMQPRP1qh2+CZxXdNaOBJw/B6KI/ziA
ONeto3C/FEx656ChdLlbM2luU2peQskDkivkH6IhyW4wqIFvoy1oxcTGWK077/fa
GXZZ7xhCVM0mse4TVg7c2KX6mUBP
-----END CERTIFICATE-----`;

/**
 * Returns CORS headers tailored to RestroZ authorized domains
 */
function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigins = [
    "https://restroz.shop",
    "https://www.restroz.shop",
    "https://restroz.pages.dev",
  ];

  const isAllowed =
    allowedOrigins.includes(origin) ||
    /^https:\/\/[a-z0-9-]+\.restroz\.shop$/.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.pages\.dev$/.test(origin) ||
    /^http:\/\/localhost(:\d+)?$/.test(origin) ||
    /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "https://restroz.shop",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. GET: Return the Public Digital Certificate
    if (req.method === "GET") {
      const customCert = Deno.env.get("QZ_CERTIFICATE");
      const cert = customCert || DEFAULT_PUBLIC_CERTIFICATE;
      return new Response(cert, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    // 2. POST: Securely sign QZ Tray request payload with RSA-SHA512
    if (req.method === "POST") {
      // Authorization Check: Verify caller is an authenticated RestroZ session
      const authHeader = req.headers.get("Authorization") || "";
      const apiKeyHeader = req.headers.get("apikey") || "";
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

      const token = authHeader.replace(/^Bearer\s+/i, "").trim();

      if (!token && !apiKeyHeader) {
        return new Response(
          JSON.stringify({ error: "Unauthorized: Missing authentication credentials." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // If a JWT token was provided, verify with Supabase Auth
      if (token && token !== supabaseAnonKey) {
        try {
          const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false },
          });
          const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
          if (userError || !user) {
            return new Response(
              JSON.stringify({ error: "Unauthorized: Invalid or expired RestroZ user session." }),
              { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } catch (authVerificationErr: any) {
          console.error("[sign-qz-tray] Session verification failed:", authVerificationErr);
          return new Response(
            JSON.stringify({ error: "Unauthorized: Session verification failed." }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Extract toSign payload without modification
      let toSign: string | null = null;
      const contentType = req.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const body = await req.json();
        if (typeof body.request === "string") {
          toSign = body.request;
        } else if (typeof body.toSign === "string") {
          toSign = body.toSign;
        } else if (typeof body.data === "string") {
          toSign = body.data;
        }
      } else {
        toSign = await req.text();
      }

      if (toSign === null || toSign === undefined || toSign.length === 0) {
        return new Response(
          JSON.stringify({ error: "Missing 'request' parameter to sign." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Load Private Key from Supabase Secret environment (never exposed to client)
      const privateKeyPem = Deno.env.get("QZ_PRIVATE_KEY");
      if (!privateKeyPem) {
        return new Response(
          JSON.stringify({
            error: "Server signing private key not configured (QZ_PRIVATE_KEY in Supabase secrets).",
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate RSA-SHA512 Signature on exact un-normalized string
      const signer = crypto.createSign("SHA512");
      signer.update(toSign);
      const signatureBase64 = signer.sign(privateKeyPem, "base64");

      // Format response based on requester's accept / content-type header
      if (contentType.includes("application/json")) {
        return new Response(JSON.stringify({ signature: signatureBase64 }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(signatureBase64, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  } catch (err: any) {
    console.error("[sign-qz-tray] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server signing error." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
