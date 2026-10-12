using System;
using System.Collections.Generic;
using System.Drawing.Printing;
using System.IO;
using System.Runtime.InteropServices;

namespace RestroZPrintAgent
{
    public static class Spooler
    {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
        public class DOCINFOA
        {
            [MarshalAs(UnmanagedType.LPStr)]
            public string pDocName;
            [MarshalAs(UnmanagedType.LPStr)]
            public string pOutputFile;
            [MarshalAs(UnmanagedType.LPStr)]
            public string pDataType;
        }

        public const int PRINTER_STATUS_PAUSED = 0x00000001;
        public const int PRINTER_STATUS_ERROR = 0x00000002;
        public const int PRINTER_STATUS_PENDING_DELETION = 0x00000004;
        public const int PRINTER_STATUS_PAPER_JAM = 0x00000008;
        public const int PRINTER_STATUS_PAPER_OUT = 0x00000010;
        public const int PRINTER_STATUS_OFFLINE = 0x00000080;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
        public struct PRINTER_INFO_2
        {
            [MarshalAs(UnmanagedType.LPStr)] public string pServerName;
            [MarshalAs(UnmanagedType.LPStr)] public string pPrinterName;
            [MarshalAs(UnmanagedType.LPStr)] public string pShareName;
            [MarshalAs(UnmanagedType.LPStr)] public string pPortName;
            [MarshalAs(UnmanagedType.LPStr)] public string pDriverName;
            [MarshalAs(UnmanagedType.LPStr)] public string pComment;
            [MarshalAs(UnmanagedType.LPStr)] public string pLocation;
            public IntPtr pDevMode;
            [MarshalAs(UnmanagedType.LPStr)] public string pSepFile;
            [MarshalAs(UnmanagedType.LPStr)] public string pPrintProcessor;
            [MarshalAs(UnmanagedType.LPStr)] public string pDatatype;
            [MarshalAs(UnmanagedType.LPStr)] public string pParameters;
            public IntPtr pSecurityDescriptor;
            public int Attributes;
            public int Priority;
            public int DefaultPriority;
            public int StartTime;
            public int UntilTime;
            public int Status;
            public int cJobs;
            public int AveragePPM;
        }

        [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

        [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool ClosePrinter(IntPtr hPrinter);

        [DllImport("winspool.drv", EntryPoint = "GetPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool GetPrinter(IntPtr hPrinter, int dwLevel, IntPtr pPrinter, int cbBuf, out int pcbNeeded);

        [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern int StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

        [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool EndDocPrinter(IntPtr hPrinter);

        [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool StartPagePrinter(IntPtr hPrinter);

        [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool EndPagePrinter(IntPtr hPrinter);

        [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

        /// <summary>
        /// Sends raw binary ESC/POS bytes directly to the specified Windows printer queue using RAW spooler mode.
        /// Includes Win32 diagnostic telemetry and spooler health inspection.
        /// </summary>
        public static bool SendBytesToPrinter(string printerName, byte[] bytes, string docName, Action<string> logger, out string errorMessage)
        {
            errorMessage = null;
            if (bytes == null || bytes.Length == 0)
            {
                errorMessage = "Print payload is empty.";
                return false;
            }

            IntPtr hPrinter = IntPtr.Zero;
            var di = new DOCINFOA
            {
                pDocName = string.IsNullOrEmpty(docName) ? "RestroZ Print Job" : docName,
                pDataType = "RAW"
            };

            string driverName = "Unknown";
            string portName = "Unknown";
            int queueStatus = 0;

            try
            {
                if (!OpenPrinter(printerName.Normalize(), out hPrinter, IntPtr.Zero))
                {
                    int err = Marshal.GetLastWin32Error();
                    errorMessage = string.Format("Could not open Windows printer '{0}'. Error code: {1}", printerName, err);
                    if (logger != null)
                    {
                        logger(string.Format("[USB PRINT]\nQueue: {0}\nDriver: Unknown\nPort: Unknown\nPayload bytes: {1}\nPrint mode: RAW\nSpool submission: FAILED (OpenPrinter)\nSpool job ID: N/A\nResult: FAILED\nWin32 error: {2}", printerName, bytes.Length, err));
                    }
                    return false;
                }

                // Query printer driver, port, and status from Windows Spooler
                int needed = 0;
                GetPrinter(hPrinter, 2, IntPtr.Zero, 0, out needed);
                if (needed > 0)
                {
                    IntPtr pInfo = Marshal.AllocHGlobal(needed);
                    try
                    {
                        if (GetPrinter(hPrinter, 2, pInfo, needed, out needed))
                        {
                            PRINTER_INFO_2 pi = (PRINTER_INFO_2)Marshal.PtrToStructure(pInfo, typeof(PRINTER_INFO_2));
                            driverName = pi.pDriverName ?? "Unknown";
                            portName = pi.pPortName ?? "Unknown";
                            queueStatus = pi.Status;
                        }
                    }
                    finally
                    {
                        Marshal.FreeHGlobal(pInfo);
                    }
                }

                // Check for critical Windows spooler queue degradation
                if ((queueStatus & PRINTER_STATUS_PENDING_DELETION) != 0)
                {
                    errorMessage = string.Format("Windows printer '{0}' is marked PENDING DELETION in Windows (driver: {1}, port: {2}). Clear stuck jobs or reinstall queue.", printerName, driverName, portName);
                    if (logger != null)
                    {
                        logger(string.Format("[USB PRINT]\nQueue: {0}\nDriver: {1}\nPort: {2}\nPayload bytes: {3}\nPrint mode: RAW\nSpool submission: REJECTED (Pending Deletion)\nSpool job ID: N/A\nResult: ERROR_PRINTER_DELETED\nWin32 error: 1905", printerName, driverName, portName, bytes.Length));
                    }
                    return false;
                }

                int jobId = StartDocPrinter(hPrinter, 1, di);
                if (jobId <= 0)
                {
                    int err = Marshal.GetLastWin32Error();
                    errorMessage = string.Format("StartDocPrinter failed for '{0}'. Error code: {1}", printerName, err);
                    if (logger != null)
                    {
                        logger(string.Format("[USB PRINT]\nQueue: {0}\nDriver: {1}\nPort: {2}\nPayload bytes: {3}\nPrint mode: RAW\nSpool submission: FAILED (StartDocPrinter)\nSpool job ID: 0\nResult: FAILED\nWin32 error: {4}", printerName, driverName, portName, bytes.Length, err));
                    }
                    return false;
                }

                if (!StartPagePrinter(hPrinter))
                {
                    int err = Marshal.GetLastWin32Error();
                    EndDocPrinter(hPrinter);
                    errorMessage = string.Format("StartPagePrinter failed for '{0}'. Error code: {1}", printerName, err);
                    if (logger != null)
                    {
                        logger(string.Format("[USB PRINT]\nQueue: {0}\nDriver: {1}\nPort: {2}\nPayload bytes: {3}\nPrint mode: RAW\nSpool submission: FAILED (StartPagePrinter)\nSpool job ID: {4}\nResult: FAILED\nWin32 error: {5}", printerName, driverName, portName, bytes.Length, jobId, err));
                    }
                    return false;
                }

                IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);

                int written = 0;
                bool writeSuccess = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out written);
                Marshal.FreeCoTaskMem(pUnmanagedBytes);

                if (!writeSuccess || written != bytes.Length)
                {
                    int err = Marshal.GetLastWin32Error();
                    EndPagePrinter(hPrinter);
                    EndDocPrinter(hPrinter);
                    errorMessage = string.Format("WritePrinter failed on '{0}'. Written: {1}/{2}. Error code: {3}", printerName, written, bytes.Length, err);
                    if (logger != null)
                    {
                        logger(string.Format("[USB PRINT]\nQueue: {0}\nDriver: {1}\nPort: {2}\nPayload bytes: {3}\nPrint mode: RAW\nSpool submission: FAILED (WritePrinter)\nSpool job ID: {4}\nResult: FAILED\nWin32 error: {5}", printerName, driverName, portName, bytes.Length, jobId, err));
                    }
                    return false;
                }

                EndPagePrinter(hPrinter);
                EndDocPrinter(hPrinter);

                if (logger != null)
                {
                    logger(string.Format("[USB PRINT]\nQueue: {0}\nDriver: {1}\nPort: {2}\nPayload bytes: {3}\nPrint mode: RAW ESC/POS\nSpool submission: SUCCESS\nSpool job ID: {4}\nResult: QUEUED_IN_SPOOLER\nWin32 error: 0", printerName, driverName, portName, bytes.Length, jobId));
                }

                return true;
            }
            catch (Exception ex)
            {
                errorMessage = ex.Message;
                if (logger != null)
                {
                    logger(string.Format("[USB PRINT EXCEPTION] Queue: {0}, Error: {1}", printerName, ex.Message));
                }
                return false;
            }
            finally
            {
                if (hPrinter != IntPtr.Zero)
                {
                    ClosePrinter(hPrinter);
                }
            }
        }

        public static bool SendBytesToPrinter(string printerName, byte[] bytes, string docName, out string errorMessage)
        {
            return SendBytesToPrinter(printerName, bytes, docName, null, out errorMessage);
        }

        public static bool SendBytesToPrinter(string printerName, byte[] bytes, out string errorMessage)
        {
            return SendBytesToPrinter(printerName, bytes, "RestroZ Print Job", null, out errorMessage);
        }

        /// <summary>
        /// Retrieves all installed Windows printer queues.
        /// </summary>
        public static List<string> GetInstalledPrinters()
        {
            var list = new List<string>();
            try
            {
                foreach (string printer in PrinterSettings.InstalledPrinters)
                {
                    if (!string.IsNullOrWhiteSpace(printer) && !list.Contains(printer))
                    {
                        list.Add(printer);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[Spooler] Error getting installed printers: " + ex.Message);
            }
            return list;
        }

        /// <summary>
        /// Generates a standard ESC/POS test receipt byte sequence.
        /// </summary>
        public static byte[] GenerateEscPosTestReceipt(string printerName, string pcName, string paperWidth = "80mm")
        {
            var is58 = paperWidth == "58mm";
            using (var ms = new MemoryStream())
            using (var bw = new BinaryWriter(ms))
            {
                // Initialize printer: ESC @
                bw.Write(new byte[] { 0x1B, 0x40 });

                // Center align: ESC a 1
                bw.Write(new byte[] { 0x1B, 0x61, 0x01 });

                // Bold ON: ESC E 1, Double Height & Width: GS ! 0x11
                bw.Write(new byte[] { 0x1B, 0x45, 0x01 });
                bw.Write(new byte[] { 0x1D, 0x21, 0x11 });
                WriteEscPosText(bw, "RESTROZ POS\n");

                // Normal text: GS ! 0x00, Bold OFF: ESC E 0
                bw.Write(new byte[] { 0x1D, 0x21, 0x00 });
                bw.Write(new byte[] { 0x1B, 0x45, 0x00 });
                WriteEscPosText(bw, "WINDOWS PRINT AGENT\n");
                WriteEscPosText(bw, "HARDWARE TEST RECEIPT\n");

                // Divider line
                string divider = is58 ? "--------------------------------\n" : "------------------------------------------------\n";
                WriteEscPosText(bw, divider);

                // Left align: ESC a 0
                bw.Write(new byte[] { 0x1B, 0x61, 0x00 });
                WriteEscPosText(bw, string.Format("Printer:    {0}\n", printerName));
                WriteEscPosText(bw, string.Format("Computer:   {0}\n", pcName));
                WriteEscPosText(bw, string.Format("Paper:      {0}\n", paperWidth));
                WriteEscPosText(bw, string.Format("Spooler:    RAW ESC/POS (winspool.drv)\n"));
                WriteEscPosText(bw, string.Format("Time:       {0}\n", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")));

                // Divider line
                WriteEscPosText(bw, divider);

                // Center align: ESC a 1
                bw.Write(new byte[] { 0x1B, 0x61, 0x01 });
                bw.Write(new byte[] { 0x1B, 0x45, 0x01 });
                WriteEscPosText(bw, "*** PRINT TEST SUCCESSFUL ***\n");
                bw.Write(new byte[] { 0x1B, 0x45, 0x00 });
                WriteEscPosText(bw, "ZERO QZ TRAY • NATIVE SPOOLER\n\n");

                // Feed lines: ESC d 4
                bw.Write(new byte[] { 0x1B, 0x64, 0x04 });

                // Paper Cut: GS V 66 0
                bw.Write(new byte[] { 0x1D, 0x56, 0x42, 0x00 });

                return ms.ToArray();
            }
        }

        /// <summary>
        /// Generates a minimal plain-text test payload (Phase 13 Test 1).
        /// </summary>
        public static byte[] GeneratePlainTextTest(string printerName)
        {
            string text = string.Format("RESTROZ USB TEST\r\n1234567890\r\nQueue: {0}\r\nTime: {1}\r\n\r\n\r\n\r\n", printerName, DateTime.Now.ToString("HH:mm:ss"));
            return System.Text.Encoding.ASCII.GetBytes(text);
        }

        /// <summary>
        /// Generates a minimal ESC/POS test payload with bold and partial cut (Phase 13 Test 2).
        /// </summary>
        public static byte[] GenerateMinimalEscPosTest(string printerName)
        {
            using (var ms = new MemoryStream())
            {
                // ESC @ (Initialize)
                ms.Write(new byte[] { 0x1B, 0x40 }, 0, 2);
                // ESC a 1 (Center)
                ms.Write(new byte[] { 0x1B, 0x61, 0x01 }, 0, 3);
                // ESC E 1 (Bold ON)
                ms.Write(new byte[] { 0x1B, 0x45, 0x01 }, 0, 3);
                byte[] header = System.Text.Encoding.ASCII.GetBytes("RESTROZ ESC/POS TEST\r\n");
                ms.Write(header, 0, header.Length);
                // ESC E 0 (Bold OFF)
                ms.Write(new byte[] { 0x1B, 0x45, 0x00 }, 0, 3);
                byte[] body = System.Text.Encoding.ASCII.GetBytes(string.Format("1234567890\r\nQueue: {0}\r\nTime: {1}\r\n\r\n\r\n\r\n", printerName, DateTime.Now.ToString("HH:mm:ss")));
                ms.Write(body, 0, body.Length);
                // GS V B 0 (Cut)
                ms.Write(new byte[] { 0x1D, 0x56, 0x42, 0x00 }, 0, 4);
                return ms.ToArray();
            }
        }

        private static void WriteEscPosText(BinaryWriter bw, string text)
        {
            byte[] bytes = System.Text.Encoding.GetEncoding(1252).GetBytes(text);
            bw.Write(bytes);
        }
    }
}
