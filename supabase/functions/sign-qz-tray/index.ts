import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import crypto from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Public X.509 Certificate for RestroZ POS Printing System.
 * Safe to distribute publicly.
 */
const DEFAULT_CERTIFICATE = `-----BEGIN CERTIFICATE-----
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. GET: Return the Digital Certificate
    if (req.method === "GET") {
      const customCert = Deno.env.get("QZ_CERTIFICATE");
      const cert = customCert || DEFAULT_CERTIFICATE;
      return new Response(cert, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // 2. POST: Sign the requested data string using SHA-512 with private key
    if (req.method === "POST") {
      let toSign = "";
      const contentType = req.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const body = await req.json();
        toSign = body.request || body.toSign || body.data || "";
      } else {
        toSign = await req.text();
      }

      if (!toSign) {
        return new Response(
          JSON.stringify({ error: "Missing 'request' parameter to sign." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const privateKeyPem = Deno.env.get("QZ_PRIVATE_KEY");
      if (!privateKeyPem) {
        return new Response(
          JSON.stringify({
            error: "Server signing private key not configured (QZ_PRIVATE_KEY).",
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate RSA-SHA512 Signature
      const signer = crypto.createSign("SHA512");
      signer.update(toSign);
      const signatureBase64 = signer.sign(privateKeyPem, "base64");

      // Support both text/plain (direct signature string) and application/json
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
    return new Response(JSON.stringify({ error: err.message || "Internal server signing error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
