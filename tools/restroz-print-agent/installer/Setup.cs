using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Win32;

namespace RestroZPrintAgentInstaller
{
    static class Setup
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            try
            {
                string targetDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "RestroZPrintAgent");
                if (!Directory.Exists(targetDir))
                {
                    Directory.CreateDirectory(targetDir);
                }

                string targetExe = Path.Combine(targetDir, "RestroZ-Print-Agent.exe");

                // Locate source binary (embedded resource, same folder, or bin subfolder)
                byte[] embeddedBytes = null;
                try
                {
                    using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("RestroZ-Print-Agent.exe"))
                    {
                        if (stream != null)
                        {
                            embeddedBytes = new byte[stream.Length];
                            stream.Read(embeddedBytes, 0, (int)stream.Length);
                        }
                    }
                }
                catch {}

                string sourceExe = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "bin", "RestroZ-Print-Agent.exe");
                if (!File.Exists(sourceExe))
                {
                    sourceExe = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "RestroZ-Print-Agent.exe");
                }

                if (embeddedBytes != null && embeddedBytes.Length > 0)
                {
                    // Stop any existing process if running
                    var running = Process.GetProcessesByName("RestroZ-Print-Agent");
                    foreach (var p in running)
                    {
                        try { p.Kill(); p.WaitForExit(3000); } catch {}
                    }

                    File.WriteAllBytes(targetExe, embeddedBytes);
                }
                else if (File.Exists(sourceExe))
                {
                    // Stop any existing process if running
                    var running = Process.GetProcessesByName("RestroZ-Print-Agent");
                    foreach (var p in running)
                    {
                        try { p.Kill(); p.WaitForExit(3000); } catch {}
                    }

                    File.Copy(sourceExe, targetExe, true);
                }

                // Add to Windows Startup Registry
                string runKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(runKey, true))
                {
                    if (key != null)
                    {
                        key.SetValue("RestroZPrintAgent", "\"" + targetExe + "\" --minimized");
                    }
                }

                // Start RestroZ Print Agent
                if (File.Exists(targetExe))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = targetExe,
                        WorkingDirectory = targetDir
                    });

                    MessageBox.Show(
                        "RestroZ Print Agent setup completed successfully!\n\n" +
                        "The Print Agent is now running and will automatically start with Windows.\n" +
                        "Look for the Print Agent icon in your Windows taskbar notification area.",
                        "RestroZ Print Agent Setup",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );
                }
                else
                {
                    MessageBox.Show(
                        "Installation failed: RestroZ-Print-Agent.exe could not be located.",
                        "RestroZ Print Agent Setup",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Setup Error: " + ex.Message,
                    "RestroZ Print Agent Setup Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }
    }
}
