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

        [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

        [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool ClosePrinter(IntPtr hPrinter);

        [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

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
        /// </summary>
        public static bool SendBytesToPrinter(string printerName, byte[] bytes, string docName, out string errorMessage)
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

            try
            {
                if (!OpenPrinter(printerName.Normalize(), out hPrinter, IntPtr.Zero))
                {
                    int err = Marshal.GetLastWin32Error();
                    errorMessage = string.Format("Could not open Windows printer '{0}'. Error code: {1}", printerName, err);
                    return false;
                }

                if (!StartDocPrinter(hPrinter, 1, di))
                {
                    int err = Marshal.GetLastWin32Error();
                    errorMessage = string.Format("StartDocPrinter failed for '{0}'. Error code: {1}", printerName, err);
                    return false;
                }

                if (!StartPagePrinter(hPrinter))
                {
                    int err = Marshal.GetLastWin32Error();
                    EndDocPrinter(hPrinter);
                    errorMessage = string.Format("StartPagePrinter failed for '{0}'. Error code: {1}", printerName, err);
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
                    return false;
                }

                EndPagePrinter(hPrinter);
                EndDocPrinter(hPrinter);
                return true;
            }
            catch (Exception ex)
            {
                errorMessage = ex.Message;
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

        public static bool SendBytesToPrinter(string printerName, byte[] bytes, out string errorMessage)
        {
            return SendBytesToPrinter(printerName, bytes, "RestroZ Print Job", out errorMessage);
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

        private static void WriteEscPosText(BinaryWriter bw, string text)
        {
            byte[] bytes = System.Text.Encoding.GetEncoding(1252).GetBytes(text);
            bw.Write(bytes);
        }
    }
}
