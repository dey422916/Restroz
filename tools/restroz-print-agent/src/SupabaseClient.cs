using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;

namespace RestroZPrintAgent
{
    public class PrintJobPayload
    {
        public string Id { get; set; }
        public string RestaurantId { get; set; }
        public string AgentId { get; set; }
        public string PrinterName { get; set; }
        public string JobType { get; set; }
        public string JobTitle { get; set; }
        public string PayloadBase64 { get; set; }
        public string PaperWidth { get; set; }
        public string Status { get; set; }
        public string Nonce { get; set; }
        public DateTime? ExpiresAt { get; set; }
    }

    public class SupabaseClient
    {
        private AgentConfig _config;

        public SupabaseClient(AgentConfig config)
        {
            _config = config;
            // Force TLS 1.2
            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | SecurityProtocolType.Tls;
        }

        public event Action<string> OnLog;

        private void Log(string message)
        {
            Console.WriteLine("[SupabaseClient] " + message);
            if (OnLog != null)
            {
                try { OnLog(message); } catch { }
            }
        }

        private string PostRpc(string rpcName, string jsonBody)
        {
            string baseUrl = _config.SupabaseUrl != null ? _config.SupabaseUrl.TrimEnd('/') : "";
            string url = string.Format("{0}/rest/v1/rpc/{1}", baseUrl, rpcName);

            Log(string.Format("[HTTP REQ] Method: POST | Endpoint: /rest/v1/rpc/{0}", rpcName));

            var req = (HttpWebRequest)WebRequest.Create(url);
            req.Method = "POST";
            req.ContentType = "application/json";
            req.Headers["apikey"] = _config.SupabaseAnonKey;
            req.Headers["Authorization"] = "Bearer " + _config.SupabaseAnonKey;
            req.Timeout = 15000;

            byte[] bytes = Encoding.UTF8.GetBytes(jsonBody);
            req.ContentLength = bytes.Length;
            using (var os = req.GetRequestStream())
            {
                os.Write(bytes, 0, bytes.Length);
            }

            try
            {
                using (var resp = (HttpWebResponse)req.GetResponse())
                using (var sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                {
                    string body = sr.ReadToEnd();
                    Log(string.Format("[HTTP RESP] Status: {0} {1} | Endpoint: {2}", (int)resp.StatusCode, resp.StatusCode, rpcName));
                    return body;
                }
            }
            catch (WebException wex)
            {
                int statusCode = 0;
                string statusDesc = "Unknown";
                string responseBody = "";

                if (wex.Response != null && wex.Response is HttpWebResponse)
                {
                    var errResp = (HttpWebResponse)wex.Response;
                    statusCode = (int)errResp.StatusCode;
                    statusDesc = errResp.StatusDescription;
                    try
                    {
                        using (var es = errResp.GetResponseStream())
                        using (var sr = new StreamReader(es, Encoding.UTF8))
                        {
                            responseBody = sr.ReadToEnd();
                        }
                    }
                    catch { }
                }

                string safeBody = RedactSecrets(responseBody);
                Log(string.Format("[HTTP FAILED] RPC: {0} | Status: {1} ({2}) | Error: {3}",
                    rpcName, statusCode, statusDesc, safeBody));

                throw new ApplicationException(string.Format("HTTP {0} {1} from {2}: {3}", statusCode, statusDesc, rpcName, safeBody), wex);
            }
        }

        private static string RedactSecrets(string input)
        {
            if (string.IsNullOrEmpty(input)) return "";
            return System.Text.RegularExpressions.Regex.Replace(
                input,
                "\"agent_token\"\\s*:\\s*\"[^\"]+\"",
                "\"agent_token\": \"[REDACTED]\""
            );
        }

        public bool RegisterAgent(out string pairingCode, out bool isPaired, out string restaurantId, out string error)
        {
            pairingCode = null;
            isPaired = false;
            restaurantId = null;
            error = null;

            try
            {
                string json = string.Format(
                    "{{\"p_device_id\":\"{0}\",\"p_device_name\":\"{1}\",\"p_os_info\":\"{2}\",\"p_agent_version\":\"1.0.0\"}}",
                    EscapeJson(_config.DeviceId),
                    EscapeJson(_config.DeviceName),
                    EscapeJson(Environment.OSVersion.ToString())
                );

                string res = PostRpc("register_print_agent", json);

                isPaired = ExtractBool(res, "is_paired");
                pairingCode = ExtractString(res, "pairing_code");
                restaurantId = ExtractString(res, "restaurant_id");
                string agentId = ExtractString(res, "agent_id");
                string agentToken = ExtractString(res, "agent_token");
                DateTime? expiresAt = ExtractDateTime(res, "pairing_code_expires_at");
                if (!string.IsNullOrEmpty(agentId))
                {
                    _config.AgentId = agentId;
                }
                if (!string.IsNullOrEmpty(agentToken))
                {
                    _config.AgentToken = agentToken;
                }
                _config.IsPaired = isPaired;
                _config.PairingCode = pairingCode;
                _config.PairingExpiresAt = expiresAt;
                _config.RestaurantId = restaurantId;
                Security.SaveConfig(_config);

                Log(string.Format("Agent registered successfully. Device: {0}", _config.DeviceName));
                if (isPaired)
                {
                    Log(string.Format("Device Status: PAIRED & READY (Restaurant: {0})", restaurantId ?? "Active"));
                }
                else if (!string.IsNullOrEmpty(pairingCode))
                {
                    Log(string.Format("Device Status: PAIRING REQUIRED | Pairing Code: {0}", pairingCode));
                }

                return true;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                Log("RegisterAgent error: " + ex.Message);
                return false;
            }
        }

        public bool UnpairAgent(out string error)
        {
            error = null;
            try
            {
                string agentId = _config.AgentId;
                string restId = _config.RestaurantId;

                if (!string.IsNullOrEmpty(agentId) && !string.IsNullOrEmpty(restId))
                {
                    string json = string.Format(
                        "{{\"p_agent_id\":\"{0}\",\"p_restaurant_id\":\"{1}\"}}",
                        EscapeJson(agentId),
                        EscapeJson(restId)
                    );

                    PostRpc("unpair_print_agent", json);
                    Log(string.Format("unpair_print_agent: 200 OK | Agent detached from restaurant ({0})", restId));
                }

                _config.IsPaired = false;
                _config.RestaurantId = null;
                _config.PairingCode = null;
                _config.PairingExpiresAt = null;
                Security.SaveConfig(_config);

                Log("Print Agent state successfully reset to NOT PAIRED.");
                return true;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                Log("UnpairAgent error: " + ex.Message);
                _config.IsPaired = false;
                _config.RestaurantId = null;
                _config.PairingCode = null;
                _config.PairingExpiresAt = null;
                Security.SaveConfig(_config);
                return false;
            }
        }

        public bool RegeneratePairingCode(out string newCode, out DateTime? expiresAt, out string error)
        {
            newCode = null;
            expiresAt = null;
            error = null;
            try
            {
                string json = string.Format(
                    "{{\"p_device_id\":\"{0}\",\"p_agent_token\":\"{1}\"}}",
                    EscapeJson(_config.DeviceId),
                    EscapeJson(_config.AgentToken)
                );

                string res = PostRpc("regenerate_print_agent_pairing_code", json);
                bool isPaired = ExtractBool(res, "is_paired");
                newCode = ExtractString(res, "pairing_code");
                expiresAt = ExtractDateTime(res, "pairing_expires_at");
                string agentId = ExtractString(res, "agent_id");
                if (!string.IsNullOrEmpty(agentId))
                {
                    _config.AgentId = agentId;
                }

                if (isPaired)
                {
                    _config.IsPaired = true;
                    _config.RestaurantId = ExtractString(res, "restaurant_id");
                    _config.PairingCode = null;
                    _config.PairingExpiresAt = null;
                }
                else if (!string.IsNullOrEmpty(newCode))
                {
                    _config.PairingCode = newCode;
                    _config.PairingExpiresAt = expiresAt;
                }
                Security.SaveConfig(_config);

                if (!string.IsNullOrEmpty(newCode))
                {
                    Log(string.Format("Manually regenerated Pairing Code: {0}", newCode));
                }

                return true;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                Log("RegeneratePairingCode error: " + ex.Message);
                return false;
            }
        }

        public bool SyncPrinters(List<string> printers, out bool isPaired, out string restaurantId, out string error)
        {
            isPaired = _config.IsPaired;
            restaurantId = _config.RestaurantId;
            error = null;

            try
            {
                var sb = new StringBuilder();
                sb.Append("[");
                for (int i = 0; i < printers.Count; i++)
                {
                    if (i > 0) sb.Append(",");
                    sb.Append(string.Format("{{\"printer_name\":\"{0}\",\"role\":\"both\",\"paper_width\":\"80mm\"}}", EscapeJson(printers[i])));
                }
                sb.Append("]");

                string json = string.Format(
                    "{{\"p_agent_token\":\"{0}\",\"p_printers\":{1}}}",
                    EscapeJson(_config.AgentToken),
                    sb.ToString()
                );

                string res = PostRpc("sync_print_agent_printers", json);
                isPaired = ExtractBool(res, "is_paired");
                restaurantId = ExtractString(res, "restaurant_id");
                string agentId = ExtractString(res, "agent_id");

                if (!string.IsNullOrEmpty(agentId))
                {
                    _config.AgentId = agentId;
                }

                if (isPaired != _config.IsPaired || restaurantId != _config.RestaurantId)
                {
                    _config.IsPaired = isPaired;
                    _config.RestaurantId = restaurantId;
                    Security.SaveConfig(_config);
                }

                Log(string.Format("sync_print_agent_printers: 200 OK | Device: {0} | Agent ID: {1} | Synced {2} queues ({3}) | Paired: {4}",
                    _config.DeviceName,
                    agentId ?? "paired",
                    printers.Count,
                    string.Join(", ", printers.ToArray()),
                    isPaired ? ("YES (" + (restaurantId ?? "Active") + ")") : "NO"));

                return true;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                Log("SyncPrinters error: " + ex.Message);
                return false;
            }
        }

        public bool AckJob(string jobId, string status, string errorMessage = null)
        {
            try
            {
                string json = string.Format(
                    "{{\"p_agent_token\":\"{0}\",\"p_job_id\":\"{1}\",\"p_status\":\"{2}\",\"p_error\":{3}}}",
                    EscapeJson(_config.AgentToken),
                    EscapeJson(jobId),
                    EscapeJson(status),
                    string.IsNullOrEmpty(errorMessage) ? "null" : ("\"" + EscapeJson(errorMessage) + "\"")
                );

                PostRpc("ack_print_job", json);
                return true;
            }
            catch (Exception ex)
            {
                Log("AckJob error: " + ex.Message);
                return false;
            }
        }

        public List<PrintJobPayload> PollPendingJobs(out bool isPaired, out string restaurantId)
        {
            isPaired = _config.IsPaired;
            restaurantId = _config.RestaurantId;
            var list = new List<PrintJobPayload>();

            try
            {
                string json = string.Format("{{\"p_agent_token\":\"{0}\"}}", EscapeJson(_config.AgentToken));
                string res = PostRpc("poll_pending_print_jobs", json);

                isPaired = ExtractBool(res, "is_paired");
                restaurantId = ExtractString(res, "restaurant_id");

                if (isPaired != _config.IsPaired || restaurantId != _config.RestaurantId)
                {
                    _config.IsPaired = isPaired;
                    _config.RestaurantId = restaurantId;
                    Security.SaveConfig(_config);
                }

                list = ParseJobs(res);
            }
            catch (Exception ex)
            {
                Log("PollPendingJobs error: " + ex.Message);
            }

            return list;
        }

        private static List<PrintJobPayload> ParseJobs(string json)
        {
            var jobs = new List<PrintJobPayload>();
            int jobsIdx = json.IndexOf("\"jobs\"");
            if (jobsIdx < 0) return jobs;

            int arrStart = json.IndexOf('[', jobsIdx);
            if (arrStart < 0) return jobs;

            int arrEnd = json.LastIndexOf(']');
            if (arrEnd <= arrStart) return jobs;

            string arrContent = json.Substring(arrStart + 1, arrEnd - arrStart - 1).Trim();
            if (string.IsNullOrEmpty(arrContent)) return jobs;

            int depth = 0;
            int objStart = -1;
            for (int i = 0; i < arrContent.Length; i++)
            {
                char c = arrContent[i];
                if (c == '{')
                {
                    if (depth == 0) objStart = i;
                    depth++;
                }
                else if (c == '}')
                {
                    depth--;
                    if (depth == 0 && objStart >= 0)
                    {
                        string objStr = arrContent.Substring(objStart, i - objStart + 1);
                        var job = new PrintJobPayload
                        {
                            Id = ExtractString(objStr, "id"),
                            RestaurantId = ExtractString(objStr, "restaurant_id"),
                            AgentId = ExtractString(objStr, "agent_id"),
                            PrinterName = ExtractString(objStr, "printer_name"),
                            JobType = ExtractString(objStr, "job_type"),
                            JobTitle = ExtractString(objStr, "job_title"),
                            PayloadBase64 = ExtractString(objStr, "payload_base64"),
                            PaperWidth = ExtractString(objStr, "paper_width"),
                            Status = ExtractString(objStr, "status"),
                            Nonce = ExtractString(objStr, "nonce"),
                        };
                        if (!string.IsNullOrEmpty(job.Id))
                        {
                            jobs.Add(job);
                        }
                        objStart = -1;
                    }
                }
            }

            return jobs;
        }

        private static string EscapeJson(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", "\\n");
        }

        public static string ExtractString(string json, string key)
        {
            if (string.IsNullOrEmpty(json) || string.IsNullOrEmpty(key)) return null;

            int keyIdx = json.IndexOf("\"" + key + "\"");
            if (keyIdx < 0) return null;

            int colonIdx = json.IndexOf(':', keyIdx + key.Length + 2);
            if (colonIdx < 0) return null;

            int start = colonIdx + 1;
            while (start < json.Length && char.IsWhiteSpace(json[start]))
            {
                start++;
            }
            if (start >= json.Length) return null;

            if (start + 4 <= json.Length && json.Substring(start, 4) == "null")
            {
                return null;
            }

            if (json[start] == '"')
            {
                start++;
                var sb = new StringBuilder();
                bool escape = false;
                for (int i = start; i < json.Length; i++)
                {
                    char c = json[i];
                    if (escape)
                    {
                        if (c == 'n') sb.Append('\n');
                        else if (c == 'r') sb.Append('\r');
                        else if (c == 't') sb.Append('\t');
                        else sb.Append(c);
                        escape = false;
                    }
                    else if (c == '\\')
                    {
                        escape = true;
                    }
                    else if (c == '"')
                    {
                        return sb.ToString();
                    }
                    else
                    {
                        sb.Append(c);
                    }
                }
                return sb.ToString();
            }
            else
            {
                var sb = new StringBuilder();
                for (int i = start; i < json.Length; i++)
                {
                    char c = json[i];
                    if (c == ',' || c == '}' || c == ']' || char.IsWhiteSpace(c))
                    {
                        break;
                    }
                    sb.Append(c);
                }
                string raw = sb.ToString().Trim();
                return raw.Length > 0 ? raw : null;
            }
        }

        public static bool ExtractBool(string json, string key)
        {
            if (string.IsNullOrEmpty(json) || string.IsNullOrEmpty(key)) return false;

            int keyIdx = json.IndexOf("\"" + key + "\"");
            if (keyIdx < 0) return false;

            int colonIdx = json.IndexOf(':', keyIdx + key.Length + 2);
            if (colonIdx < 0) return false;

            int start = colonIdx + 1;
            while (start < json.Length && char.IsWhiteSpace(json[start]))
            {
                start++;
            }
            if (start >= json.Length) return false;

            return (start + 4 <= json.Length && json.Substring(start, 4).Equals("true", StringComparison.OrdinalIgnoreCase));
        }

        public static DateTime? ExtractDateTime(string json, string key)
        {
            string s = ExtractString(json, key);
            if (string.IsNullOrEmpty(s)) return null;

            DateTime dt;
            if (DateTime.TryParse(s, null, System.Globalization.DateTimeStyles.RoundtripKind, out dt))
            {
                return dt.ToLocalTime();
            }
            if (DateTime.TryParse(s, out dt))
            {
                return dt;
            }
            return null;
        }
    }
}
