using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32;

namespace RestroZPrintAgent
{
    public class AgentConfig
    {
        public string DeviceId { get; set; }
        public string DeviceName { get; set; }
        public string AgentToken { get; set; }
        public string RestaurantId { get; set; }
        public string PairingCode { get; set; }
        public DateTime? PairingExpiresAt { get; set; }
        public bool IsPaired { get; set; }
        public string SupabaseUrl { get; set; }
        public string SupabaseAnonKey { get; set; }
        public bool RunAtStartup { get; set; }

        public AgentConfig()
        {
            DeviceId = Guid.NewGuid().ToString("N");
            DeviceName = Environment.MachineName;
            AgentToken = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
            RestaurantId = null;
            PairingCode = null;
            PairingExpiresAt = null;
            IsPaired = false;
            SupabaseUrl = "https://szpjsibrwxegaopcaukb.supabase.co";
            SupabaseAnonKey = "sb_publishable_Jh0O9Why0grSgCb3WjjpYQ_Uwj7RclD";
            RunAtStartup = true;
        }
    }

    public static class Security
    {
        private static readonly string AppDataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "RestroZPrintAgent"
        );

        private static readonly string ConfigFilePath = Path.Combine(AppDataDir, "agent_config.dat");
        private static readonly string JournalFilePath = Path.Combine(AppDataDir, "processed_jobs.log");

        public static string GetAppDataDir()
        {
            if (!Directory.Exists(AppDataDir))
            {
                Directory.CreateDirectory(AppDataDir);
            }
            return AppDataDir;
        }

        /// <summary>
        /// Saves config encrypted using Windows DPAPI (CurrentUser scope).
        /// </summary>
        public static void SaveConfig(AgentConfig config)
        {
            try
            {
                GetAppDataDir();
                var sb = new StringBuilder();
                sb.AppendLine("DeviceId=" + (config.DeviceId ?? ""));
                sb.AppendLine("DeviceName=" + (config.DeviceName ?? ""));
                sb.AppendLine("AgentToken=" + (config.AgentToken ?? ""));
                sb.AppendLine("RestaurantId=" + (config.RestaurantId ?? ""));
                sb.AppendLine("PairingCode=" + (config.PairingCode ?? ""));
                sb.AppendLine("PairingExpiresAt=" + (config.PairingExpiresAt.HasValue ? config.PairingExpiresAt.Value.ToString("o") : ""));
                sb.AppendLine("IsPaired=" + (config.IsPaired ? "true" : "false"));
                sb.AppendLine("SupabaseUrl=" + (config.SupabaseUrl ?? ""));
                sb.AppendLine("SupabaseAnonKey=" + (config.SupabaseAnonKey ?? ""));
                sb.AppendLine("RunAtStartup=" + (config.RunAtStartup ? "true" : "false"));

                byte[] plainBytes = Encoding.UTF8.GetBytes(sb.ToString());
                byte[] cipherBytes = ProtectedData.Protect(plainBytes, null, DataProtectionScope.CurrentUser);
                File.WriteAllBytes(ConfigFilePath, cipherBytes);

                SetStartupRegistry(config.RunAtStartup);
            }
            catch (Exception ex)
            {
                Console.WriteLine("[Security] SaveConfig error: " + ex.Message);
            }
        }

        /// <summary>
        /// Loads config decrypted via Windows DPAPI.
        /// </summary>
        public static AgentConfig LoadConfig()
        {
            var config = new AgentConfig();
            try
            {
                if (!File.Exists(ConfigFilePath))
                {
                    SaveConfig(config);
                    return config;
                }

                byte[] cipherBytes = File.ReadAllBytes(ConfigFilePath);
                byte[] plainBytes = ProtectedData.Unprotect(cipherBytes, null, DataProtectionScope.CurrentUser);
                string text = Encoding.UTF8.GetString(plainBytes);

                using (var reader = new StringReader(text))
                {
                    string line;
                    while ((line = reader.ReadLine()) != null)
                    {
                        int idx = line.IndexOf('=');
                        if (idx <= 0) continue;
                        string key = line.Substring(0, idx).Trim();
                        string val = line.Substring(idx + 1).Trim();

                        switch (key)
                        {
                            case "DeviceId": if (!string.IsNullOrEmpty(val)) config.DeviceId = val; break;
                            case "DeviceName": if (!string.IsNullOrEmpty(val)) config.DeviceName = val; break;
                            case "AgentToken": if (!string.IsNullOrEmpty(val)) config.AgentToken = val; break;
                            case "RestaurantId": if (!string.IsNullOrEmpty(val)) config.RestaurantId = val; break;
                            case "PairingCode": if (!string.IsNullOrEmpty(val)) config.PairingCode = val; break;
                            case "PairingExpiresAt":
                                if (!string.IsNullOrEmpty(val))
                                {
                                    DateTime dt;
                                    if (DateTime.TryParse(val, out dt)) config.PairingExpiresAt = dt;
                                }
                                break;
                            case "IsPaired": config.IsPaired = string.Equals(val, "true", StringComparison.OrdinalIgnoreCase); break;
                            case "SupabaseUrl": if (!string.IsNullOrEmpty(val)) config.SupabaseUrl = val; break;
                            case "SupabaseAnonKey": if (!string.IsNullOrEmpty(val)) config.SupabaseAnonKey = val; break;
                            case "RunAtStartup": config.RunAtStartup = string.Equals(val, "true", StringComparison.OrdinalIgnoreCase); break;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[Security] LoadConfig error: " + ex.Message);
                SaveConfig(config);
            }
            return config;
        }

        public static void SetStartupRegistry(bool enable)
        {
            try
            {
                string runKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(runKey, true))
                {
                    if (key != null)
                    {
                        string exePath = System.Reflection.Assembly.GetExecutingAssembly().Location;
                        if (enable)
                        {
                            key.SetValue("RestroZPrintAgent", "\"" + exePath + "\" --minimized");
                        }
                        else
                        {
                            key.DeleteValue("RestroZPrintAgent", false);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[Security] SetStartupRegistry error: " + ex.Message);
            }
        }

        public static bool IsJobAlreadyProcessed(string jobId)
        {
            if (string.IsNullOrEmpty(jobId)) return false;
            try
            {
                GetAppDataDir();
                if (!File.Exists(JournalFilePath)) return false;
                var lines = File.ReadAllLines(JournalFilePath);
                foreach (var line in lines)
                {
                    if (line.Trim().Equals(jobId.Trim(), StringComparison.OrdinalIgnoreCase))
                    {
                        return true;
                    }
                }
            }
            catch {}
            return false;
        }

        public static void RecordJobProcessed(string jobId)
        {
            if (string.IsNullOrEmpty(jobId)) return;
            try
            {
                GetAppDataDir();
                File.AppendAllText(JournalFilePath, jobId.Trim() + Environment.NewLine);
            }
            catch {}
        }
    }
}
