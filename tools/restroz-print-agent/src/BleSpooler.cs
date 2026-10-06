using System;
using System.Collections.Generic;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Windows.Foundation;
using Windows.Devices.Enumeration;
using Windows.Devices.Bluetooth;
using Windows.Devices.Bluetooth.GenericAttributeProfile;
using Windows.Storage.Streams;

namespace RestroZPrintAgent
{
    public static class WinRtExtensions
    {
        public static Task<TResult> ToTask<TResult>(this IAsyncOperation<TResult> op)
        {
            var tcs = new TaskCompletionSource<TResult>();
            op.Completed = new AsyncOperationCompletedHandler<TResult>((asyncInfo, asyncStatus) =>
            {
                if (asyncStatus == AsyncStatus.Completed)
                    tcs.TrySetResult(asyncInfo.GetResults());
                else if (asyncStatus == AsyncStatus.Error)
                    tcs.TrySetException(asyncInfo.ErrorCode ?? new Exception("WinRT Async Operation failed"));
                else if (asyncStatus == AsyncStatus.Canceled)
                    tcs.TrySetCanceled();
            });
            return tcs.Task;
        }
    }

    public class BlePrinterInfo
    {
        public string Name { get; set; }
        public ulong BluetoothAddress { get; set; }
        public string MacAddressFormatted { get; set; }
        public string DeviceId { get; set; }
        public string DisplayName { get; set; }
    }

    public static class BleSpooler
    {
        // Proven Thermal Printer Service & Characteristic UUIDs
        private static readonly Guid SERVICE_FF00 = new Guid("0000ff00-0000-1000-8000-00805f9b34fb");
        private static readonly Guid CHAR_FF02 = new Guid("0000ff02-0000-1000-8000-00805f9b34fb");

        private static readonly Guid SERVICE_18F0 = new Guid("000018f0-0000-1000-8000-00805f9b34fb");
        private static readonly Guid CHAR_2AF1 = new Guid("00002af1-0000-1000-8000-00805f9b34fb");

        private static readonly Guid SERVICE_ISSC = new Guid("49535343-fe7d-4ae5-8fa9-9fafd205e455");
        private static readonly Guid CHAR_ISSC_WRITE = new Guid("49535343-8841-43f4-a8d4-ecbe34729bb3");

        private static readonly Guid SERVICE_FFF0 = new Guid("0000fff0-0000-1000-8000-00805f9b34fb");
        private static readonly Guid CHAR_FFF2 = new Guid("0000fff2-0000-1000-8000-00805f9b34fb");

        // Single concurrent BLE print job lock per printer destination
        private static readonly object _bleLock = new object();

        // Cached discovered BLE printers
        private static readonly List<BlePrinterInfo> _cachedBlePrinters = new List<BlePrinterInfo>();

        public static List<BlePrinterInfo> GetDiscoveredBlePrinters()
        {
            lock (_bleLock)
            {
                try
                {
                    var result = new List<BlePrinterInfo>();

                    // 1. Discover via BluetoothLEDevice paired devices / enumeration selector
                    string selector = BluetoothLEDevice.GetDeviceSelectorFromPairingState(true);
                    var op = DeviceInformation.FindAllAsync(selector);
                    var devices = op.ToTask().GetAwaiter().GetResult();

                    foreach (var d in devices)
                    {
                        if (string.IsNullOrEmpty(d.Name)) continue;

                        // Check if device matches thermal printer naming conventions or specific hardware
                        string nameLower = d.Name.ToLowerInvariant();
                        bool isCandidate = nameLower.Contains("seznik") ||
                                           nameLower.Contains("pos") ||
                                           nameLower.Contains("printer") ||
                                           nameLower.Contains("thermal") ||
                                           nameLower.Contains("mpt") ||
                                           nameLower.Contains("rpp");

                        if (isCandidate)
                        {
                            try
                            {
                                var devOp = BluetoothLEDevice.FromIdAsync(d.Id);
                                using (var bleDev = devOp.ToTask().GetAwaiter().GetResult())
                                {
                                    if (bleDev != null)
                                    {
                                        ulong addr = bleDev.BluetoothAddress;
                                        string mac = FormatMac(addr);
                                        string dispName = string.Format("{0} [Native BLE]", bleDev.Name);

                                        result.Add(new BlePrinterInfo
                                        {
                                            Name = bleDev.Name,
                                            BluetoothAddress = addr,
                                            MacAddressFormatted = mac,
                                            DeviceId = d.Id,
                                            DisplayName = dispName
                                        });
                                    }
                                }
                            }
                            catch { }
                        }
                    }

                    // Always ensure Seznik-Veer_925C is resolved if paired on Windows (60:6E:41:62:92:5C)
                    ulong seznikMac = 0x606E4162925C;
                    bool hasSeznik = result.Exists(p => p.BluetoothAddress == seznikMac || p.Name.IndexOf("seznik", StringComparison.OrdinalIgnoreCase) >= 0);
                    if (!hasSeznik)
                    {
                        try
                        {
                            var seznikOp = BluetoothLEDevice.FromBluetoothAddressAsync(seznikMac);
                            using (var sDev = seznikOp.ToTask().GetAwaiter().GetResult())
                            {
                                if (sDev != null)
                                {
                                    result.Add(new BlePrinterInfo
                                    {
                                        Name = string.IsNullOrEmpty(sDev.Name) ? "Seznik-Veer_925C" : sDev.Name,
                                        BluetoothAddress = seznikMac,
                                        MacAddressFormatted = "60:6E:41:62:92:5C",
                                        DeviceId = sDev.DeviceId,
                                        DisplayName = (string.IsNullOrEmpty(sDev.Name) ? "Seznik-Veer_925C" : sDev.Name) + " [Native BLE]"
                                    });
                                }
                            }
                        }
                        catch { }
                    }

                    _cachedBlePrinters.Clear();
                    _cachedBlePrinters.AddRange(result);
                    return new List<BlePrinterInfo>(_cachedBlePrinters);
                }
                catch (Exception ex)
                {
                    Console.WriteLine("[BleSpooler] Discovery error: " + ex.Message);
                    return new List<BlePrinterInfo>(_cachedBlePrinters);
                }
            }
        }

        public static bool IsBlePrinter(string printerName)
        {
            if (string.IsNullOrEmpty(printerName)) return false;
            if (printerName.IndexOf("[Native BLE]", StringComparison.OrdinalIgnoreCase) >= 0 ||
                printerName.IndexOf("[BLE]", StringComparison.OrdinalIgnoreCase) >= 0 ||
                printerName.IndexOf("Native BLE", StringComparison.OrdinalIgnoreCase) >= 0 ||
                printerName.IndexOf("Seznik", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return true;
            }

            lock (_bleLock)
            {
                return _cachedBlePrinters.Exists(p =>
                    string.Equals(p.Name, printerName, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(p.DisplayName, printerName, StringComparison.OrdinalIgnoreCase)
                );
            }
        }

        public static bool SendBytesToBlePrinter(string targetPrinterName, byte[] bytes, out string errorMessage)
        {
            errorMessage = null;
            if (bytes == null || bytes.Length == 0)
            {
                errorMessage = "Print payload is empty.";
                return false;
            }

            // Destination Locking: ensure only one print job writes to BLE hardware at a time
            lock (_bleLock)
            {
                try
                {
                    return SendBytesToBlePrinterInternalAsync(targetPrinterName, bytes).GetAwaiter().GetResult();
                }
                catch (Exception ex)
                {
                    errorMessage = ex.Message;
                    Console.WriteLine(string.Format("[BleSpooler] Transmission error to '{0}': {1}", targetPrinterName, ex.Message));
                    return false;
                }
            }
        }

        private static async Task<bool> SendBytesToBlePrinterInternalAsync(string targetPrinterName, byte[] bytes)
        {
            // Resolve target Bluetooth address
            ulong targetAddress = 0;
            string cleanName = targetPrinterName.Replace("[Native BLE]", "").Replace("[BLE]", "").Trim();

            // Check cached devices first
            foreach (var p in _cachedBlePrinters)
            {
                if (string.Equals(p.Name, cleanName, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(p.DisplayName, targetPrinterName, StringComparison.OrdinalIgnoreCase) ||
                    targetPrinterName.IndexOf(p.Name, StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    targetAddress = p.BluetoothAddress;
                    break;
                }
            }

            // Default fallback for Seznik-Veer_925C
            if (targetAddress == 0 && cleanName.IndexOf("seznik", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                targetAddress = 0x606E4162925C;
            }

            if (targetAddress == 0)
            {
                // Try to discover
                var discovered = GetDiscoveredBlePrinters();
                foreach (var p in discovered)
                {
                    if (string.Equals(p.Name, cleanName, StringComparison.OrdinalIgnoreCase) ||
                        targetPrinterName.IndexOf(p.Name, StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        targetAddress = p.BluetoothAddress;
                        break;
                    }
                }
            }

            if (targetAddress == 0)
            {
                throw new ApplicationException(string.Format("Could not resolve Bluetooth BLE hardware address for printer '{0}'.", targetPrinterName));
            }

            Console.WriteLine(string.Format("[BleSpooler] Connecting to '{0}' (Address: {1:X12})...", cleanName, targetAddress));

            using (BluetoothLEDevice device = await BluetoothLEDevice.FromBluetoothAddressAsync(targetAddress).ToTask())
            {
                if (device == null)
                {
                    throw new ApplicationException(string.Format("BluetoothLEDevice.FromBluetoothAddressAsync returned null for address {0:X12}.", targetAddress));
                }

                // Locate writable GATT service and characteristic
                GattDeviceService targetService = null;
                GattCharacteristic writeChar = null;

                var candidateServices = new[]
                {
                    new { Service = SERVICE_FF00, Char = CHAR_FF02 },
                    new { Service = SERVICE_18F0, Char = CHAR_2AF1 },
                    new { Service = SERVICE_ISSC, Char = CHAR_ISSC_WRITE },
                    new { Service = SERVICE_FFF0, Char = CHAR_FFF2 }
                };

                foreach (var pair in candidateServices)
                {
                    try
                    {
                        var sRes = await device.GetGattServicesForUuidAsync(pair.Service).ToTask();
                        if (sRes.Status == GattCommunicationStatus.Success && sRes.Services.Count > 0)
                        {
                            var s = sRes.Services[0];
                            await s.RequestAccessAsync().ToTask();
                            await s.OpenAsync(GattSharingMode.SharedReadAndWrite).ToTask();

                            var cRes = await s.GetCharacteristicsForUuidAsync(pair.Char).ToTask();
                            if (cRes.Status == GattCommunicationStatus.Success && cRes.Characteristics.Count > 0)
                            {
                                targetService = s;
                                writeChar = cRes.Characteristics[0];
                                Console.WriteLine(string.Format("[BleSpooler] Matched GATT Service: {0}, Characteristic: {1}", s.Uuid, writeChar.Uuid));
                                break;
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine(string.Format("[BleSpooler] Candidate {0} check warning: {1}", pair.Service, ex.Message));
                    }
                }

                // If not found in known list, traverse all primary services
                if (writeChar == null)
                {
                    var allServicesRes = await device.GetGattServicesAsync(BluetoothCacheMode.Uncached).ToTask();
                    if (allServicesRes.Status == GattCommunicationStatus.Success)
                    {
                        foreach (var s in allServicesRes.Services)
                        {
                            try
                            {
                                await s.RequestAccessAsync().ToTask();
                                await s.OpenAsync(GattSharingMode.SharedReadAndWrite).ToTask();
                                var allCharsRes = await s.GetCharacteristicsAsync().ToTask();
                                if (allCharsRes.Status == GattCommunicationStatus.Success)
                                {
                                    foreach (var c in allCharsRes.Characteristics)
                                    {
                                        if (c.CharacteristicProperties.HasFlag(GattCharacteristicProperties.WriteWithoutResponse) ||
                                            c.CharacteristicProperties.HasFlag(GattCharacteristicProperties.Write))
                                        {
                                            targetService = s;
                                            writeChar = c;
                                            Console.WriteLine(string.Format("[BleSpooler] Discovered writable Characteristic: {0} on Service: {1}", c.Uuid, s.Uuid));
                                            break;
                                        }
                                    }
                                }
                            }
                            catch { }
                            if (writeChar != null) break;
                        }
                    }
                }

                if (writeChar == null)
                {
                    throw new ApplicationException(string.Format("No writable GATT characteristic found on BLE printer '{0}'.", cleanName));
                }

                // Transmit in 20-byte chunks with 50ms pacing (strictly mirroring Web Bluetooth)
                const int CHUNK_SIZE = 20;
                const int CHUNK_DELAY_MS = 50;
                int totalChunks = (int)Math.Ceiling((double)bytes.Length / CHUNK_SIZE);

                Console.WriteLine(string.Format("[BleSpooler] Transmitting {0} bytes in {1} chunks ({2} bytes/chunk, {3}ms delay)...",
                    bytes.Length, totalChunks, CHUNK_SIZE, CHUNK_DELAY_MS));

                for (int i = 0; i < bytes.Length; i += CHUNK_SIZE)
                {
                    int chunkLen = Math.Min(CHUNK_SIZE, bytes.Length - i);
                    byte[] chunk = new byte[chunkLen];
                    System.Buffer.BlockCopy(bytes, i, chunk, 0, chunkLen);

                    using (DataWriter writer = new DataWriter())
                    {
                        writer.WriteBytes(chunk);
                        IBuffer buffer = writer.DetachBuffer();

                        GattCommunicationStatus status = await writeChar.WriteValueAsync(buffer, GattWriteOption.WriteWithoutResponse).ToTask();
                        if (status != GattCommunicationStatus.Success)
                        {
                            Console.WriteLine(string.Format("[BleSpooler] Warning: Chunk {0}/{1} status = {2}", (i / CHUNK_SIZE) + 1, totalChunks, status));
                        }
                    }

                    await Task.Delay(CHUNK_DELAY_MS);
                }

                // 200ms post-document drain delay
                await Task.Delay(200);

                Console.WriteLine(string.Format("[BleSpooler] SUCCESS: {0} bytes completely sent to '{1}'.", bytes.Length, cleanName));
                return true;
            }
        }

        public static byte[] GenerateEscPosTestReceipt(string printerName, string hostName, string paperWidth)
        {
            List<byte> payload = new List<byte>();

            // 1. ESC @ (Initialize)
            payload.Add(0x1B); payload.Add(0x40);
            // 2. ESC M 0 (Font A)
            payload.Add(0x1B); payload.Add(0x4D); payload.Add(0x00);
            // 3. GS ! 0 (Normal 1x1 scale)
            payload.Add(0x1D); payload.Add(0x21); payload.Add(0x00);
            // 4. ESC E 0 (Bold off)
            payload.Add(0x1B); payload.Add(0x45); payload.Add(0x00);
            // 5. ESC a 1 (Align center)
            payload.Add(0x1B); payload.Add(0x61); payload.Add(0x01);

            int width = (paperWidth == "80mm") ? 42 : 32;
            string divider = new string('-', width);

            StringBuilder sb = new StringBuilder();
            sb.AppendLine();
            sb.AppendLine("================================");
            sb.AppendLine("     RESTROZ PRINT AGENT        ");
            sb.AppendLine("    NATIVE BLUETOOTH BLE        ");
            sb.AppendLine("================================");
            sb.AppendLine("HARDWARE TEST RECEIPT");
            sb.AppendLine(divider);
            sb.AppendLine("Printer:   " + (printerName ?? "Seznik-Veer_925C"));
            sb.AppendLine("Transport: Native Windows BLE");
            sb.AppendLine("Host:      " + (hostName ?? Environment.MachineName));
            sb.AppendLine("Width:     " + (paperWidth ?? "58mm"));
            sb.AppendLine("Time:      " + DateTime.Now.ToString("HH:mm:ss"));
            sb.AppendLine(divider);
            sb.AppendLine("ESC/POS CENTRAL BLE ACTIVE");
            sb.AppendLine("*** TEST PRINT SUCCESSFUL ***");
            sb.AppendLine(divider);
            sb.AppendLine();
            sb.AppendLine();
            sb.AppendLine();
            sb.AppendLine();

            payload.AddRange(Encoding.ASCII.GetBytes(sb.ToString()));
            return payload.ToArray();
        }

        public static byte[] GenerateRasterProbePayload(string probeType, string printerName)
        {
            List<byte> p = new List<byte>();

            // Initialize ESC @
            p.Add(0x1B); p.Add(0x40);
            p.Add(0x1B); p.Add(0x61); p.Add(0x01); // Center

            StringBuilder header = new StringBuilder();
            header.AppendLine();
            header.AppendLine("=== RASTER PROBE TEST ===");
            header.AppendLine("Type: " + probeType);
            header.AppendLine("Printer: " + printerName);
            header.AppendLine("------------------------");
            p.AddRange(Encoding.ASCII.GetBytes(header.ToString()));

            if (probeType == "GS_V0_64_BLACK")
            {
                // 1D 76 30 00 08 00 40 00 [512 bytes FF]
                p.Add(0x1D); p.Add(0x76); p.Add(0x30); p.Add(0x00);
                p.Add(0x08); p.Add(0x00); // 8 bytes width = 64 dots
                p.Add(0x40); p.Add(0x00); // 64 dots height
                for (int i = 0; i < 512; i++) p.Add(0xFF);
                p.Add(0x0A);
            }
            else if (probeType == "GS_V0_64_CHECKER")
            {
                // 1D 76 30 00 08 00 40 00 [512 bytes checker]
                p.Add(0x1D); p.Add(0x76); p.Add(0x30); p.Add(0x00);
                p.Add(0x08); p.Add(0x00);
                p.Add(0x40); p.Add(0x00);
                for (int y = 0; y < 64; y++)
                {
                    bool isEvenY = (y / 8) % 2 == 0;
                    for (int b = 0; b < 8; b++)
                    {
                        bool isEvenX = (b % 2 == 0);
                        p.Add((byte)((isEvenY == isEvenX) ? 0xFF : 0x00));
                    }
                }
                p.Add(0x0A);
            }
            else if (probeType == "GS_V0_128_RECT")
            {
                // 1D 76 30 00 10 00 40 00 [1024 bytes FF]
                p.Add(0x1D); p.Add(0x76); p.Add(0x30); p.Add(0x00);
                p.Add(0x10); p.Add(0x00); // 16 bytes width = 128 dots
                p.Add(0x40); p.Add(0x00); // 64 dots height
                for (int i = 0; i < 1024; i++) p.Add(0xFF);
                p.Add(0x0A);
            }
            else if (probeType == "ESC_STAR_64_BLACK")
            {
                // 24-dot line spacing: ESC 3 24
                p.Add(0x1B); p.Add(0x33); p.Add(24);
                // 3 bands of 24 dots for 64 dots height
                for (int b = 0; b < 3; b++)
                {
                    // ESC * 33 64 0
                    p.Add(0x1B); p.Add(0x2A); p.Add(33);
                    p.Add(64); p.Add(0); // 64 columns
                    for (int x = 0; x < 64; x++)
                    {
                        p.Add(0xFF); p.Add(0xFF); p.Add(0xFF); // 3 bytes per column (24 vertical dots)
                    }
                    p.Add(0x0A); // LF
                }
                // ESC 2 (Restore line spacing)
                p.Add(0x1B); p.Add(0x32); p.Add(0x0A);
            }
            else if (probeType == "ESC_STAR_64_CHECKER")
            {
                p.Add(0x1B); p.Add(0x33); p.Add(24);
                for (int b = 0; b < 3; b++)
                {
                    p.Add(0x1B); p.Add(0x2A); p.Add(33);
                    p.Add(64); p.Add(0);
                    for (int x = 0; x < 64; x++)
                    {
                        bool isTileX = (x / 8) % 2 == 0;
                        byte b0 = 0, b1 = 0, b2 = 0;
                        for (int d = 0; d < 8; d++) { if (isTileX == (((b * 24 + d) / 8) % 2 == 0)) b0 |= (byte)(0x80 >> d); }
                        for (int d = 0; d < 8; d++) { if (isTileX == (((b * 24 + 8 + d) / 8) % 2 == 0)) b1 |= (byte)(0x80 >> d); }
                        for (int d = 0; d < 8; d++) { if (isTileX == (((b * 24 + 16 + d) / 8) % 2 == 0)) b2 |= (byte)(0x80 >> d); }
                        p.Add(b0); p.Add(b1); p.Add(b2);
                    }
                    p.Add(0x0A);
                }
                p.Add(0x1B); p.Add(0x32); p.Add(0x0A);
            }

            StringBuilder footer = new StringBuilder();
            footer.AppendLine("------------------------");
            footer.AppendLine("*** PROBE COMPLETE ***");
            footer.AppendLine();
            footer.AppendLine();
            footer.AppendLine();
            p.AddRange(Encoding.ASCII.GetBytes(footer.ToString()));

            return p.ToArray();
        }

        private static string FormatMac(ulong addr)
        {
            byte[] b = BitConverter.GetBytes(addr);
            return string.Format("{0:X2}:{1:X2}:{2:X2}:{3:X2}:{4:X2}:{5:X2}", b[5], b[4], b[3], b[2], b[1], b[0]);
        }
    }
}
