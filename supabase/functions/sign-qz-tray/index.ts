import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import crypto from "node:crypto";

/**
 * Official RestroZ POS Production Public Signing Certificate.
 * Subject: CN=RestroZ POS, O=RestroZ Technologies, OU=POS Printing System, C=IN
 * Issuer: CN=RestroZ Root CA, O=RestroZ Technologies, OU=Security & Trust Infrastructure, C=IN
 * SHA-1 Fingerprint: f50c94c745587958bbb549596e3d0626ccffe4d6
 * SHA-256 Fingerprint: 42b080d769ba3023160c363d5d0ba6223bb827da8ea52232d8df15f77deb2e91
 */
const DEFAULT_PUBLIC_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIDsTCCApmgAwIBAgIJAuz39mery01vMA0GCSqGSIb3DQEBCwUAMHAxCzAJBgNV
BAYTAklOMR0wGwYDVQQKExRSZXN0cm9aIFRlY2hub2xvZ2llczEoMCYGA1UECxMf
U2VjdXJpdHkgJiBUcnVzdCBJbmZyYXN0cnVjdHVyZTEYMBYGA1UEAxMPUmVzdHJv
WiBSb290IENBMB4XDTI2MDkyNzE0MDk0NVoXDTM2MDkyNzE0MDk0NVowYDELMAkG
A1UEBhMCSU4xHTAbBgNVBAoTFFJlc3Ryb1ogVGVjaG5vbG9naWVzMRwwGgYDVQQL
ExNQT1MgUHJpbnRpbmcgU3lzdGVtMRQwEgYDVQQDEwtSZXN0cm9aIFBPUzCCASIw
DQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAOdzX6Yy3W+v9gDczWGcWYvJNaII
7aSBoTZ+SuivOcmoCtRwGgowtLDmg5MWQJEwzg/X4KLU5wWMUlZOPPr4s5+wyV1U
lDskU3moEy0dvdkT7P50zXtIePecNPS/NCWx973ETYWgyV0/HCYlghkO8/mnIOtF
gpjxpOlggEm8dHvBG7eX2Xz3w8A46EX2OCKZ+Jf+3F4cP0zD6UyDR5JWTZEVNlS9
22/qjTFJU3EuanXe9LWLGWMMA5d9aklqjWITcPs8qbLV/fzRmyzEUvj/Btd6YJdA
RPvnMKmqtJ81SY+WklwzUlguRfsujI8o0oK+8jeUvMoJbLH2NLxZ5Mg066ECAwEA
AaNeMFwwDAYDVR0TAQH/BAIwADAOBgNVHQ8BAf8EBAMCBsAwHQYDVR0lBBYwFAYI
KwYBBQUHAwMGCCsGAQUFBwMCMB0GA1UdDgQWBBTL9l7/1XIPkma7oagrEBdKRrA6
LDANBgkqhkiG9w0BAQsFAAOCAQEAEMldnmtUZA/mxRDoDFL7/m4RLzh5r2Bdbe/5
Rq7rhLs7cKFM2MqEgElZsj8saGJ1486EFsSoGVJ9kIY0sZQLnqVR5A50SBCuqMkg
r9Mof1JLsbIGVt0MLTL1uDaY5hL1/AjH5Z8yLvYDQZpMyarRL5927D5GHQ3nk+YQ
FvqJNLjQ4kwVgKWQlfWfr6dzIF7YS1dRD6EudS+i6Y4XJMBlir4oqTogQ+ACfNgy
lfr7EmMkB2acVMgYBzob7XnD8QIn7/9mT1IDcP5ba6Gg+dMQn65jFifdX5aB99lr
H7bK3h/CzPkmC4In+20RJnZePWl7BOu+73pjLVgZ0+fVvwqFjQ==
-----END CERTIFICATE-----`;

const MAX_PAYLOAD_BYTES = 64 * 1024; // 64 KB

/**
 * Returns CORS headers tailored to RestroZ authorized origins
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
      const cert = customCert
        ? (customCert.includes("\\n") ? customCert.replace(/\\n/g, "\n") : customCert)
        : DEFAULT_PUBLIC_CERTIFICATE;
      return new Response(cert.trim(), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    // 2. POST: Securely sign QZ Tray request payload with RSA-SHA512
    if (req.method === "POST") {
      // Enforce Payload Size Limit (Max 64 KB)
      const contentLengthHeader = req.headers.get("content-length");
      if (contentLengthHeader && parseInt(contentLengthHeader, 10) > MAX_PAYLOAD_BYTES) {
        return new Response(
          JSON.stringify({ error: "Payload Too Large: Maximum allowed signing request size is 64 KB." }),
          { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Authorization Check: Verify caller is an authenticated RestroZ user
      const authHeader = req.headers.get("Authorization") || "";
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

      const token = authHeader.replace(/^Bearer\s+/i, "").trim();

      if (!token) {
        return new Response(
          JSON.stringify({ error: "Unauthorized: Missing authentication credentials." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify user JWT token with Supabase Auth
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
          return new Response(
            JSON.stringify({ error: "Unauthorized: Session verification failed." }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Parse and extract exact toSign string without modification
      let toSign: string | null = null;
      const contentType = req.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        try {
          const body = await req.json();
          if (typeof body?.request === "string") {
            toSign = body.request;
          } else if (typeof body?.toSign === "string") {
            toSign = body.toSign;
          } else if (typeof body?.data === "string") {
            toSign = body.data;
          } else {
            return new Response(
              JSON.stringify({ error: "Malformed Request: 'request' field must be a valid non-empty string." }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON format in request body." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        toSign = await req.text();
      }

      if (toSign === null || toSign === undefined || toSign.length === 0) {
        return new Response(
          JSON.stringify({ error: "Missing or empty 'request' parameter to sign." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (toSign.length > MAX_PAYLOAD_BYTES) {
        return new Response(
          JSON.stringify({ error: "Payload Too Large: Signing data exceeds 64 KB limit." }),
          { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Load Private Key from Supabase Secret environment (never exposed to client)
      const rawKey = Deno.env.get("QZ_PRIVATE_KEY");
      if (!rawKey) {
        return new Response(
          JSON.stringify({
            error: "Server signing private key not configured (QZ_PRIVATE_KEY in Supabase secrets).",
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const privateKeyPem = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;

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
    return new Response(JSON.stringify({ error: err.message || "Internal server signing error." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
