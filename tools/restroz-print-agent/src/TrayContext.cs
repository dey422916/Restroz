using System;
using System.Drawing;
using System.Windows.Forms;

namespace RestroZPrintAgent
{
    public class TrayContext : ApplicationContext
    {
        private readonly AgentConfig _config;
        private readonly SupabaseClient _client;
        private readonly PrintEngine _engine;
        private readonly MainForm _mainForm;
        private readonly NotifyIcon _trayIcon;

        public TrayContext(AgentConfig config, SupabaseClient client, PrintEngine engine, bool startMinimized)
        {
            _config = config;
            _client = client;
            _engine = engine;
            _mainForm = new MainForm(_config, _engine);

            // Create Tray Icon
            _trayIcon = new NotifyIcon
            {
                Icon = SystemIcons.Application,
                Text = "RestroZ Print Agent",
                Visible = true
            };

            var contextMenu = new ContextMenuStrip();
            var mnuStatus = new ToolStripMenuItem("RestroZ Print Agent") { Enabled = false };
            var mnuOpen = new ToolStripMenuItem("Open Dashboard", null, (s, e) => ShowMainForm());
            var mnuTestPrint = new ToolStripMenuItem("Send Test Print", null, (s, e) => HandleQuickTestPrint());
            var mnuRefresh = new ToolStripMenuItem("Re-scan Printers", null, (s, e) => _engine.RefreshPrinters());
            var mnuExit = new ToolStripMenuItem("Exit Print Agent", null, (s, e) => ExitApplication());

            contextMenu.Items.Add(mnuStatus);
            contextMenu.Items.Add(new ToolStripSeparator());
            contextMenu.Items.Add(mnuOpen);
            contextMenu.Items.Add(mnuTestPrint);
            contextMenu.Items.Add(mnuRefresh);
            contextMenu.Items.Add(new ToolStripSeparator());
            contextMenu.Items.Add(mnuExit);

            _trayIcon.ContextMenuStrip = contextMenu;
            _trayIcon.DoubleClick += (s, e) => ShowMainForm();

            // Start background engine
            _engine.Start();

            if (!startMinimized)
            {
                ShowMainForm();
            }
        }

        private void ShowMainForm()
        {
            _mainForm.Show();
            _mainForm.WindowState = FormWindowState.Normal;
            _mainForm.BringToFront();
            _mainForm.Activate();
        }

        private void HandleQuickTestPrint()
        {
            var printers = Spooler.GetInstalledPrinters();
            if (printers.Count == 0)
            {
                MessageBox.Show("No installed Windows printers detected.", "Test Print", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            string printerName = printers[0];
            string error;
            bool ok = _engine.SendTestPrint(printerName, "80mm", out error);
            if (ok)
            {
                _trayIcon.ShowBalloonTip(3000, "RestroZ Print Agent", string.Format("Test print sent to '{0}'", printerName), ToolTipIcon.Info);
            }
            else
            {
                _trayIcon.ShowBalloonTip(5000, "RestroZ Print Agent", string.Format("Test print failed: {0}", error), ToolTipIcon.Error);
            }
        }

        private void ExitApplication()
        {
            _engine.Stop();
            _trayIcon.Visible = false;
            Application.Exit();
        }
    }
}
