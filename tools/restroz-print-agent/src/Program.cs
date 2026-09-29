using System;
using System.Threading;
using System.Windows.Forms;

namespace RestroZPrintAgent
{
    static class Program
    {
        private static Mutex _singleInstanceMutex;

        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool isNewInstance;
            _singleInstanceMutex = new Mutex(true, "Global\\RestroZPrintAgent_SingleInstance_Mutex", out isNewInstance);

            if (!isNewInstance)
            {
                MessageBox.Show(
                    "RestroZ Print Agent is already running in your Windows System Tray (near the clock).",
                    "RestroZ Print Agent",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
                return;
            }

            bool startMinimized = false;
            foreach (var arg in args)
            {
                if (arg.Equals("--minimized", StringComparison.OrdinalIgnoreCase) || arg.Equals("-m", StringComparison.OrdinalIgnoreCase))
                {
                    startMinimized = true;
                }
            }

            var config = Security.LoadConfig();
            var client = new SupabaseClient(config);
            var engine = new PrintEngine(config, client);

            var trayContext = new TrayContext(config, client, engine, startMinimized);
            Application.Run(trayContext);

            _singleInstanceMutex.ReleaseMutex();
        }
    }
}
