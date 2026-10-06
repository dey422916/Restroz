using System;
using System.Drawing;
using System.Windows.Forms;

namespace RestroZPrintAgent
{
    public class MainForm : Form
    {
        private readonly AgentConfig _config;
        private readonly PrintEngine _engine;

        private Label _lblTitle;
        private Label _lblStatus;
        private Panel _pnlPairing;
        private Label _lblPairingHeader;
        private Label _lblPairingCode;
        private Label _lblExpiry;
        private Button _btnCopyCode;
        private Button _btnGenerateNewCode;
        private Button _btnUnpair;
        private ListBox _lstPrinters;
        private Button _btnRefreshPrinters;
        private Button _btnTestPrint;
        private TextBox _txtLogs;
        private CheckBox _chkStartup;
        private Timer _expiryTimer;

        public MainForm(AgentConfig config, PrintEngine engine)
        {
            _config = config;
            _engine = engine;
            InitializeComponent();
            _engine.OnLog += AppendLog;
            _engine.OnStatusChanged += UpdateUiState;

            _expiryTimer = new Timer { Interval = 1000 };
            _expiryTimer.Tick += (s, e) => UpdateExpiryCountdown();
            _expiryTimer.Start();

            UpdateUiState();
        }

        private void InitializeComponent()
        {
            this.Text = "RestroZ Print Agent";
            this.Size = new Size(580, 650);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(24, 24, 27);
            this.ForeColor = Color.White;
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);

            // Title
            _lblTitle = new Label
            {
                Text = "RESTROZ PRINT AGENT",
                Font = new Font("Segoe UI", 14f, FontStyle.Bold),
                ForeColor = Color.FromArgb(249, 115, 22),
                Location = new Point(20, 16),
                AutoSize = true
            };
            this.Controls.Add(_lblTitle);

            // Status Label
            _lblStatus = new Label
            {
                Text = "● REGISTERING...",
                Font = new Font("Segoe UI", 10f, FontStyle.Bold),
                ForeColor = Color.FromArgb(234, 179, 8),
                Location = new Point(22, 48),
                AutoSize = true
            };
            this.Controls.Add(_lblStatus);

            // Pairing Panel
            _pnlPairing = new Panel
            {
                Location = new Point(20, 78),
                Size = new Size(524, 116),
                BackColor = Color.FromArgb(39, 39, 42),
            };

            _lblPairingHeader = new Label
            {
                Text = "ONE-TIME PAIRING CODE (Enter in RestroZ Settings > Connect Printer):",
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                ForeColor = Color.FromArgb(161, 161, 170),
                Location = new Point(14, 10),
                AutoSize = true
            };
            _pnlPairing.Controls.Add(_lblPairingHeader);

            _lblPairingCode = new Label
            {
                Text = "------",
                Font = new Font("Segoe UI", 26f, FontStyle.Bold),
                ForeColor = Color.FromArgb(34, 197, 94),
                Location = new Point(14, 32),
                AutoSize = true
            };
            _pnlPairing.Controls.Add(_lblPairingCode);

            _lblExpiry = new Label
            {
                Text = "",
                Font = new Font("Segoe UI", 8.5f, FontStyle.Regular),
                ForeColor = Color.FromArgb(161, 161, 170),
                Location = new Point(16, 88),
                AutoSize = true
            };
            _pnlPairing.Controls.Add(_lblExpiry);

            _btnCopyCode = new Button
            {
                Text = "Copy Code",
                Location = new Point(360, 40),
                Size = new Size(145, 36),
                BackColor = Color.FromArgb(249, 115, 22),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                Cursor = Cursors.Hand,
                Enabled = false
            };
            _btnCopyCode.FlatAppearance.BorderSize = 0;
            _btnCopyCode.Click += (s, e) =>
            {
                if (!string.IsNullOrEmpty(_config.PairingCode) && _config.PairingCode != "------")
                {
                    Clipboard.SetText(_config.PairingCode);
                    MessageBox.Show(
                        string.Format("Pairing Code '{0}' copied to clipboard!\n\nEnter this code in RestroZ Web Settings > Connect Printer > Windows Printer.", _config.PairingCode),
                        "RestroZ Print Agent",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );
                }
            };
            _pnlPairing.Controls.Add(_btnCopyCode);

            _btnGenerateNewCode = new Button
            {
                Text = "Generate New Code",
                Location = new Point(340, 40),
                Size = new Size(165, 36),
                BackColor = Color.FromArgb(234, 179, 8),
                ForeColor = Color.Black,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                Cursor = Cursors.Hand,
                Visible = false
            };
            _btnGenerateNewCode.FlatAppearance.BorderSize = 0;
            _btnGenerateNewCode.Click += (s, e) =>
            {
                _btnGenerateNewCode.Enabled = false;
                string err;
                bool ok = _engine.RequestNewPairingCode(out err);
                if (!ok)
                {
                    MessageBox.Show("Failed to generate fresh pairing code: " + err, "Pairing Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
                _btnGenerateNewCode.Enabled = true;
            };
            _pnlPairing.Controls.Add(_btnGenerateNewCode);

            _btnUnpair = new Button
            {
                Text = "Unpair Restaurant",
                Location = new Point(340, 40),
                Size = new Size(165, 36),
                BackColor = Color.FromArgb(220, 38, 38),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                Cursor = Cursors.Hand,
                Visible = false
            };
            _btnUnpair.FlatAppearance.BorderSize = 0;
            _btnUnpair.Click += (s, e) =>
            {
                var result = MessageBox.Show(
                    this,
                    "Unpair this Print Agent from the current restaurant?\n\nMobile and remote print jobs will no longer be sent to this computer until the Print Agent is paired again.",
                    "Unpair Restaurant",
                    MessageBoxButtons.OKCancel,
                    MessageBoxIcon.Warning
                );

                if (result == DialogResult.OK)
                {
                    _btnUnpair.Enabled = false;
                    string err;
                    bool ok = _engine.Unpair(out err);
                    if (!ok)
                    {
                        MessageBox.Show(this, "Failed to unpair agent: " + err, "Unpair Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                    _btnUnpair.Enabled = true;
                }
            };
            _pnlPairing.Controls.Add(_btnUnpair);

            this.Controls.Add(_pnlPairing);

            // Printers Section
            var lblPrintersHeader = new Label
            {
                Text = "Detected Windows Printer Queues:",
                Font = new Font("Segoe UI", 10f, FontStyle.Bold),
                ForeColor = Color.FromArgb(228, 228, 231),
                Location = new Point(20, 206),
                AutoSize = true
            };
            this.Controls.Add(lblPrintersHeader);

            _lstPrinters = new ListBox
            {
                Location = new Point(20, 232),
                Size = new Size(524, 96),
                BackColor = Color.FromArgb(39, 39, 42),
                ForeColor = Color.White,
                BorderStyle = BorderStyle.FixedSingle,
                Font = new Font("Segoe UI", 10f, FontStyle.Regular)
            };
            this.Controls.Add(_lstPrinters);

            _btnRefreshPrinters = new Button
            {
                Text = "Re-scan Printers",
                Location = new Point(20, 338),
                Size = new Size(150, 32),
                BackColor = Color.FromArgb(63, 63, 70),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            _btnRefreshPrinters.FlatAppearance.BorderSize = 0;
            _btnRefreshPrinters.Click += (s, e) => _engine.RefreshPrinters();
            this.Controls.Add(_btnRefreshPrinters);

            _btnTestPrint = new Button
            {
                Text = "Send Test Print",
                Location = new Point(180, 338),
                Size = new Size(150, 32),
                BackColor = Color.FromArgb(34, 197, 94),
                ForeColor = Color.Black,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                Cursor = Cursors.Hand
            };
            _btnTestPrint.FlatAppearance.BorderSize = 0;
            _btnTestPrint.Click += HandleTestPrintClick;
            this.Controls.Add(_btnTestPrint);

            // Startup checkbox
            _chkStartup = new CheckBox
            {
                Text = "Start with Windows",
                Checked = _config.RunAtStartup,
                Location = new Point(360, 344),
                AutoSize = true,
                ForeColor = Color.FromArgb(212, 212, 216),
                Cursor = Cursors.Hand
            };
            _chkStartup.CheckedChanged += (s, e) =>
            {
                _config.RunAtStartup = _chkStartup.Checked;
                Security.SaveConfig(_config);
            };
            this.Controls.Add(_chkStartup);

            // Logs Section
            var lblLogsHeader = new Label
            {
                Text = "Live Print Activity Log:",
                Font = new Font("Segoe UI", 10f, FontStyle.Bold),
                ForeColor = Color.FromArgb(228, 228, 231),
                Location = new Point(20, 382),
                AutoSize = true
            };
            this.Controls.Add(lblLogsHeader);

            _txtLogs = new TextBox
            {
                Location = new Point(20, 406),
                Size = new Size(524, 184),
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Vertical,
                BackColor = Color.FromArgb(15, 15, 18),
                ForeColor = Color.FromArgb(161, 161, 170),
                BorderStyle = BorderStyle.FixedSingle,
                Font = new Font("Consolas", 9f, FontStyle.Regular)
            };
            this.Controls.Add(_txtLogs);
        }

        private void HandleTestPrintClick(object sender, EventArgs e)
        {
            if (_lstPrinters.SelectedItem == null)
            {
                MessageBox.Show("Please select an installed Windows printer from the list above first.", "Test Print", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            string printerName = _lstPrinters.SelectedItem.ToString();
            string error;
            bool ok = _engine.SendTestPrint(printerName, "80mm", out error);
            if (ok)
            {
                MessageBox.Show(string.Format("Test print successfully sent to '{0}'!", printerName), "Test Print", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else
            {
                MessageBox.Show(string.Format("Test print failed: {0}", error), "Test Print Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        public void UpdateUiState()
        {
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action(UpdateUiState));
                return;
            }

            if (_config.IsPaired)
            {
                _lblStatus.Text = string.Format("● ONLINE • Paired with Restaurant ({0})", _config.RestaurantId ?? "Active");
                _lblStatus.ForeColor = Color.FromArgb(34, 197, 94);
                _lblPairingHeader.Text = "DEVICE STATUS:";
                _lblPairingCode.Text = "PAIRED READY";
                _lblPairingCode.ForeColor = Color.FromArgb(34, 197, 94);
                _lblPairingCode.Font = new Font("Segoe UI", 18f, FontStyle.Bold);
                _btnCopyCode.Visible = false;
                _btnGenerateNewCode.Visible = false;
                _btnUnpair.Visible = true;
                _lblExpiry.Text = "";
            }
            else
            {
                _btnUnpair.Visible = false;
                bool isExpired = _config.PairingExpiresAt.HasValue && DateTime.Now > _config.PairingExpiresAt.Value;
                bool hasCode = !string.IsNullOrEmpty(_config.PairingCode) && _config.PairingCode != "------";

                if (isExpired)
                {
                    _lblStatus.Text = "○ PAIRING CODE EXPIRED";
                    _lblStatus.ForeColor = Color.FromArgb(239, 68, 68);
                    _lblPairingHeader.Text = "ONE-TIME PAIRING CODE:";
                    _lblPairingCode.Text = "EXPIRED";
                    _lblPairingCode.ForeColor = Color.FromArgb(239, 68, 68);
                    _lblPairingCode.Font = new Font("Segoe UI", 22f, FontStyle.Bold);
                    _lblExpiry.Text = "Pairing code expired. Click Generate New Code to refresh.";
                    _lblExpiry.ForeColor = Color.FromArgb(239, 68, 68);
                    _btnCopyCode.Visible = false;
                    _btnGenerateNewCode.Visible = true;
                    _btnGenerateNewCode.Enabled = true;
                }
                else if (hasCode)
                {
                    _lblStatus.Text = "○ PAIRING REQUIRED";
                    _lblStatus.ForeColor = Color.FromArgb(234, 179, 8);
                    _lblPairingHeader.Text = "ONE-TIME PAIRING CODE (Enter in RestroZ Settings > Connect Printer):";
                    _lblPairingCode.Text = _config.PairingCode;
                    _lblPairingCode.ForeColor = Color.FromArgb(34, 197, 94);
                    _lblPairingCode.Font = new Font("Segoe UI", 26f, FontStyle.Bold);
                    _btnCopyCode.Visible = true;
                    _btnCopyCode.Enabled = true;
                    _btnGenerateNewCode.Visible = false;

                    UpdateExpiryCountdown();
                }
                else
                {
                    _lblStatus.Text = "● REGISTERING...";
                    _lblStatus.ForeColor = Color.FromArgb(234, 179, 8);
                    _lblPairingHeader.Text = "ONE-TIME PAIRING CODE:";
                    _lblPairingCode.Text = "------";
                    _lblPairingCode.ForeColor = Color.FromArgb(161, 161, 170);
                    _lblPairingCode.Font = new Font("Segoe UI", 26f, FontStyle.Bold);
                    _btnCopyCode.Visible = true;
                    _btnCopyCode.Enabled = false;
                    _btnGenerateNewCode.Visible = false;
                    _lblExpiry.Text = "Connecting to RestroZ Cloud...";
                    _lblExpiry.ForeColor = Color.FromArgb(161, 161, 170);
                }
            }

            // Update printer list
            _lstPrinters.Items.Clear();
            var printers = _engine.GetDiscoveredPrinters();
            foreach (var p in printers)
            {
                _lstPrinters.Items.Add(p);
            }
            if (_lstPrinters.Items.Count > 0 && _lstPrinters.SelectedIndex < 0)
            {
                _lstPrinters.SelectedIndex = 0;
            }
        }

        private void UpdateExpiryCountdown()
        {
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action(UpdateExpiryCountdown));
                return;
            }

            if (_config.IsPaired) return;

            if (_config.PairingExpiresAt.HasValue)
            {
                var remaining = _config.PairingExpiresAt.Value - DateTime.Now;
                if (remaining.TotalSeconds > 0)
                {
                    _lblExpiry.Text = string.Format("Code expires in {0:D2}:{1:D2}", (int)remaining.TotalMinutes, remaining.Seconds);
                    _lblExpiry.ForeColor = Color.FromArgb(161, 161, 170);
                }
                else
                {
                    UpdateUiState();
                }
            }
        }

        private void AppendLog(string message)
        {
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action<string>(AppendLog), message);
                return;
            }
            _txtLogs.AppendText(message + Environment.NewLine);
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            // Minimize to system tray instead of closing
            if (e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                this.Hide();
            }
            base.OnFormClosing(e);
        }
    }
}
