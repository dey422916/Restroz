using System;
using System.Collections.Generic;
using System.Threading;

namespace RestroZPrintAgent
{
    public class PrintEngine
    {
        private readonly AgentConfig _config;
        private readonly SupabaseClient _client;
        private Thread _workerThread;
        private bool _isRunning;
        private readonly HashSet<string> _processedJobs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        public event Action<string> OnLog;
        public event Action OnStatusChanged;

        public bool IsRunning { get { return _isRunning; } }
        public bool IsPaired { get { return _config.IsPaired; } }
        public string PairingCode { get { return _config.PairingCode; } }
        public string RestaurantId { get { return _config.RestaurantId; } }

        public PrintEngine(AgentConfig config, SupabaseClient client)
        {
            _config = config;
            _client = client;
            _client.OnLog += Log;
        }

        public void Start()
        {
            if (_isRunning) return;
            _isRunning = true;
            _workerThread = new Thread(WorkerLoop) { IsBackground = true };
            _workerThread.Start();
            Log("Print Agent engine started.");
        }

        public void Stop()
        {
            _isRunning = false;
            Log("Print Agent engine stopping...");
        }

        private void Log(string message)
        {
            string formatted = string.Format("[{0}] {1}", DateTime.Now.ToString("HH:mm:ss"), message);
            Console.WriteLine(formatted);
            if (OnLog != null)
            {
                try { OnLog(formatted); } catch {}
            }
        }

        public void RefreshPrinters()
        {
            try
            {
                var printers = Spooler.GetInstalledPrinters();
                Log(string.Format("Detected {0} Windows printer queue(s): {1}", printers.Count, string.Join(", ", printers.ToArray())));
                bool isPaired;
                string restId, error;
                _client.SyncPrinters(printers, out isPaired, out restId, out error);
                if (OnStatusChanged != null) OnStatusChanged();
            }
            catch (Exception ex)
            {
                Log("RefreshPrinters error: " + ex.Message);
            }
        }

        public bool RequestNewPairingCode(out string error)
        {
            error = null;
            string newCode;
            DateTime? expiresAt;
            Log("Requesting manual pairing code regeneration from DEV backend...");
            bool ok = _client.RegeneratePairingCode(out newCode, out expiresAt, out error);
            if (ok)
            {
                if (OnStatusChanged != null) OnStatusChanged();
            }
            return ok;
        }

        public bool Unpair(out string error)
        {
            error = null;
            Log("Unpairing Print Agent from current restaurant...");
            bool ok = _client.UnpairAgent(out error);
            if (ok)
            {
                Log("Agent successfully unpaired from restaurant. Regenerating fresh pairing code...");
                string newCode;
                DateTime? expiresAt;
                string regenErr;
                _client.RegeneratePairingCode(out newCode, out expiresAt, out regenErr);
                RefreshPrinters();
                if (OnStatusChanged != null) OnStatusChanged();
            }
            else
            {
                Log("Unpair failed: " + error);
            }
            return ok;
        }

        private void WorkerLoop()
        {
            int syncCounter = 0;

            // Initial Registration: ONLY ONCE at startup
            string code, restId, err;
            bool isPaired;
            if (_client.RegisterAgent(out code, out isPaired, out restId, out err))
            {
                RefreshPrinters();
            }
            else
            {
                Log("Initial agent registration failed: " + err);
            }

            if (OnStatusChanged != null) OnStatusChanged();

            // Continuous background loop (Heartbeat, Printer sync, Job polling)
            // DO NOT call register_print_agent inside this loop!
            while (_isRunning)
            {
                try
                {
                    if (_config.IsPaired)
                    {
                        // Paired: poll pending print jobs every 2 seconds
                        var jobs = _client.PollPendingJobs(out isPaired, out restId);
                        if (jobs != null && jobs.Count > 0)
                        {
                            foreach (var job in jobs)
                            {
                                ProcessJob(job);
                            }
                        }

                        // Sync printers and heartbeat every 30 seconds
                        if (syncCounter % 15 == 0)
                        {
                            var printers = Spooler.GetInstalledPrinters();
                            _client.SyncPrinters(printers, out isPaired, out restId, out err);
                        }
                    }
                    else
                    {
                        // Unpaired: check pairing status & heartbeat via SyncPrinters (never calls register_print_agent)
                        var printers = Spooler.GetInstalledPrinters();
                        bool wasPaired = _config.IsPaired;
                        _client.SyncPrinters(printers, out isPaired, out restId, out err);
                        if (isPaired && !wasPaired)
                        {
                            _config.IsPaired = true;
                            _config.RestaurantId = restId;
                            _config.PairingCode = null;
                            _config.PairingExpiresAt = null;
                            Security.SaveConfig(_config);
                            Log(string.Format("Pairing SUCCESSFUL! Paired with restaurant: {0}", restId));
                            RefreshPrinters();
                            if (OnStatusChanged != null) OnStatusChanged();
                        }
                    }
                    syncCounter++;
                }
                catch (Exception ex)
                {
                    Log("WorkerLoop tick error: " + ex.Message);
                }

                // Poll every 2 seconds
                Thread.Sleep(2000);
            }
        }

        public void ProcessJob(PrintJobPayload job)
        {
            if (job == null || string.IsNullOrEmpty(job.Id)) return;

            // 1. Exactly-Once Idempotency Protection Check
            if (_processedJobs.Contains(job.Id) || Security.IsJobAlreadyProcessed(job.Id))
            {
                Log(string.Format("Duplicate job {0} received; skipping physical print and acknowledging.", job.Id));
                _client.AckJob(job.Id, "printed");
                return;
            }

            // 2. Validate Restaurant / Device Match
            if (!string.IsNullOrEmpty(_config.RestaurantId) && !string.IsNullOrEmpty(job.RestaurantId))
            {
                if (!string.Equals(_config.RestaurantId, job.RestaurantId, StringComparison.OrdinalIgnoreCase))
                {
                    Log(string.Format("REJECTED job {0}: Tenant mismatch (Job rest: {1}, Paired rest: {2})", job.Id, job.RestaurantId, _config.RestaurantId));
                    _client.AckJob(job.Id, "failed", "Tenant mismatch");
                    return;
                }
            }

            Log(string.Format("Processing Print Job [{0}] Type: {1}, Printer: '{2}'", job.JobTitle ?? job.Id, job.JobType, job.PrinterName));

            // Mark received/printing
            _client.AckJob(job.Id, "printing");

            try
            {
                // Decode base64 ESC/POS payload
                byte[] rawBytes = Convert.FromBase64String(job.PayloadBase64);
                string spoolError;
                bool success = Spooler.SendBytesToPrinter(job.PrinterName, rawBytes, job.JobTitle ?? "RestroZ Print Job", out spoolError);

                if (success)
                {
                    Log(string.Format("PRINT SUCCESS: Job '{0}' sent to '{1}' ({2} bytes)", job.JobTitle, job.PrinterName, rawBytes.Length));
                    _processedJobs.Add(job.Id);
                    Security.RecordJobProcessed(job.Id);
                    _client.AckJob(job.Id, "printed");
                }
                else
                {
                    Log(string.Format("PRINT FAILED: Job '{0}' on '{1}'. Reason: {2}", job.JobTitle, job.PrinterName, spoolError));
                    _client.AckJob(job.Id, "failed", spoolError);
                }
            }
            catch (Exception ex)
            {
                Log(string.Format("PRINT ERROR for Job '{0}': {1}", job.JobTitle, ex.Message));
                _client.AckJob(job.Id, "failed", ex.Message);
            }
        }

        public bool SendTestPrint(string printerName, string paperWidth, out string error)
        {
            error = null;
            try
            {
                Log(string.Format("Sending hardware test print to '{0}' ({1})...", printerName, paperWidth));
                byte[] bytes = Spooler.GenerateEscPosTestReceipt(printerName, _config.DeviceName, paperWidth);
                bool ok = Spooler.SendBytesToPrinter(printerName, bytes, "RestroZ Hardware Test", out error);
                if (ok)
                {
                    Log("Test print sent successfully to Windows queue: " + printerName);
                }
                else
                {
                    Log("Test print failed: " + error);
                }
                return ok;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                Log("Test print exception: " + ex.Message);
                return false;
            }
        }

        public bool SendTestPrint(string printerName, out string error)
        {
            return SendTestPrint(printerName, "80mm", out error);
        }
    }
}
