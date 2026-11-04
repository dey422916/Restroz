import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Platform,
  TextInput,
} from 'react-native';
import { RestaurantSettings, RestaurantPrinter } from '../types';
import {
  webDirectPrintService,
  ConfiguredDirectPrinter,
  DirectPrinterRole,
  DirectPaperWidth,
  DirectPrinterStatus,
  PrintAgentInfo,
} from '../services/webDirectPrintService';
import { setLocalKotPrinter, setLocalBillPrinter } from '../services/directPrintService';
import { printerManager } from '../services/printerManager';
import { devicePrinterBindingService } from '../services/printerManager/devicePrinterBindings';
import { BluetoothDeviceInfo, UsbDeviceInfo } from '../services/printerManager/transports/types';

interface Props {
  restaurantId: string;
  canManage: boolean;
  settings?: RestaurantSettings | null;
  showToast: (type: 'success' | 'error' | 'info', title: string, message: string) => void;
}

type WizardStep =
  | 'choose_type'
  | 'bluetooth_pair'
  | 'usb_detect'
  | 'serial_detect'
  | 'windows_agent_pair'
  | 'windows_select'
  | 'android_bluetooth_scan'
  | 'android_usb_select'
  | 'android_network_input'
  | 'configure_test';

export const SeznikPrinterManagementSection: React.FC<Props> = ({
  restaurantId,
  canManage,
  settings,
  showToast,
}) => {
  const [printers, setPrinters] = useState<ConfiguredDirectPrinter[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [testingPrinterId, setTestingPrinterId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Print Agent State
  const [pairedAgent, setPairedAgent] = useState<PrintAgentInfo | null>(null);
  const [pairingCodeInput, setPairingCodeInput] = useState('');
  const [isPairingAgent, setIsPairingAgent] = useState(false);
  const [isUnpairingAgent, setIsUnpairingAgent] = useState(false);
  const [detectedAgentName, setDetectedAgentName] = useState<string | null>(null);
  const [isDetectingAgent, setIsDetectingAgent] = useState(false);

  // Wizard Modal State
  const [wizardVisible, setWizardVisible] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>('choose_type');
  const [isWizardLoading, setIsWizardLoading] = useState(false);
  const [pendingPrinter, setPendingPrinter] = useState<ConfiguredDirectPrinter | null>(null);
  const [wizardRole, setWizardRole] = useState<DirectPrinterRole>('both');
  const [wizardPaperWidth, setWizardPaperWidth] = useState<DirectPaperWidth>('80mm');
  const [wizardIsPrimary, setWizardIsPrimary] = useState(true);
  const [selectedWindowsPrinter, setSelectedWindowsPrinter] = useState('');
  const [wizardNotice, setWizardNotice] = useState<string | null>(null);
  const [wizardSearchQuery, setWizardSearchQuery] = useState('');

  // Native Android Bluetooth & Hardware State
  const [discoveredBluetoothDevices, setDiscoveredBluetoothDevices] = useState<BluetoothDeviceInfo[]>([]);
  const [isScanningBt, setIsScanningBt] = useState(false);
  const [btScanComplete, setBtScanComplete] = useState(false);
  const [selectedBtDevice, setSelectedBtDevice] = useState<BluetoothDeviceInfo | null>(null);
  const [discoveredUsbDevices, setDiscoveredUsbDevices] = useState<UsbDeviceInfo[]>([]);
  const [pendingUsbInfo, setPendingUsbInfo] = useState<UsbDeviceInfo | null>(null);
  const [ipAddressInput, setIpAddressInput] = useState('');
  const [portInput, setPortInput] = useState('9100');

  // Edit Modal State
  const [editingPrinter, setEditingPrinter] = useState<ConfiguredDirectPrinter | null>(null);
  const [editRole, setEditRole] = useState<DirectPrinterRole>('both');
  const [editPaperWidth, setEditPaperWidth] = useState<DirectPaperWidth>('80mm');
  const [editIsPrimary, setEditIsPrimary] = useState(false);

  const isBtSupported = webDirectPrintService.isBluetoothSupported();
  const isUsbSupported = webDirectPrintService.isUsbSupported();
  const isSerialSupported = webDirectPrintService.isSerialSupported();

  const loadPrintersAndAgent = useCallback(async () => {
    setIsLoading(true);
    try {
      if (Platform.OS === 'web') {
        const list = await webDirectPrintService.restorePrinters(restaurantId);
        setPrinters(list);

        const agent = await webDirectPrintService.getPairedAgent(restaurantId);
        setPairedAgent(agent);
      } else {
        const devicePrinters = await devicePrinterBindingService.getDevicePrinters();
        const bindings = await devicePrinterBindingService.getAllDeviceBindings();
        const defaults = await devicePrinterBindingService.getDeviceDefaults();

        let btOn = true;
        try {
          btOn = await printerManager.isBluetoothEnabled();
        } catch (_) {}

        const mapped: ConfiguredDirectPrinter[] = devicePrinters
          .filter(
            (p) =>
              !restaurantId ||
              !p.restaurant_id ||
              p.restaurant_id === restaurantId ||
              p.connection_type === 'bluetooth' ||
              p.connection_type === 'usb'
          )
          .map((p) => {
            const binding = bindings[p.id];
            const isPrimary = Boolean(
              p.is_primary ||
                defaults.default_kot_printer_id === p.id ||
                defaults.default_bill_printer_id === p.id
            );

            let status: DirectPrinterStatus = 'connected';
            let statusMessage: string | undefined;

            if (p.connection_type === 'bluetooth') {
              const mac = binding?.bluetooth_mac_address || (p as any).bluetooth_mac_address;
              if (!mac) {
                status = 'reconnect_required';
                statusMessage = 'Bluetooth printer not bound to this device.';
              } else if (!btOn) {
                status = 'offline';
                statusMessage = 'Bluetooth is turned OFF in Android settings.';
              }
            }

            return {
              id: p.id,
              name: p.name,
              transport:
                p.connection_type === 'bluetooth'
                  ? 'bluetooth'
                  : p.connection_type === 'usb'
                  ? 'usb'
                  : (p.connection_type as any),
              paperWidth: p.paper_width || '80mm',
              role: p.printer_role || 'both',
              isPrimary,
              status,
              statusMessage,
              deviceId: binding?.bluetooth_mac_address || (p as any).bluetooth_mac_address || p.ip_address || undefined,
              bluetoothDeviceId: binding?.bluetooth_mac_address || (p as any).bluetooth_mac_address || undefined,
            };
          });

        setPrinters(mapped);
      }
    } catch (err: any) {
      console.warn('[SeznikPrinterManagement] Error loading printers/agent:', err);
    } finally {
      setIsLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    loadPrintersAndAgent();
  }, [loadPrintersAndAgent]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const unsubscribe = webDirectPrintService.onPrinterStatusChange((printer, status, message) => {
      if (status === 'disconnected') {
        showToast(
          'error',
          'Printer Disconnected',
          message || 'The configured printer is no longer connected.'
        );
      }
      const saved = webDirectPrintService.getSavedPrinters(restaurantId);
      setPrinters(saved);
    });
    return unsubscribe;
  }, [showToast, restaurantId]);

  // Open Wizard
  const handleOpenWizard = () => {
    setWizardStep('choose_type');
    setPendingPrinter(null);
    setSelectedWindowsPrinter('');
    setWizardNotice(null);
    setWizardRole('both');
    setWizardPaperWidth('80mm');
    setWizardIsPrimary(printers.length === 0);
    setPairingCodeInput('');
    setDetectedAgentName(null);
    setDiscoveredBluetoothDevices([]);
    setSelectedBtDevice(null);
    setDiscoveredUsbDevices([]);
    setPendingUsbInfo(null);
    setIpAddressInput('');
    setPortInput('9100');
    setWizardVisible(true);
  };

  // 1. Bluetooth Wizard Flow
  const handleStartBluetooth = async () => {
    setIsWizardLoading(true);
    setWizardNotice(null);
    try {
      const btPrinter = await webDirectPrintService.pairBluetoothPrinter(
        { role: wizardRole, paperWidth: '58mm', isPrimary: wizardIsPrimary },
        restaurantId
      );
      setPendingPrinter(btPrinter);
      setWizardPaperWidth('58mm');
      setWizardStep('configure_test');
      showToast('success', 'Bluetooth Connected', `Paired with "${btPrinter.name}" via Web Bluetooth!`);
    } catch (err: any) {
      setWizardNotice(err.message || 'Bluetooth connection failed or was cancelled.');
    } finally {
      setIsWizardLoading(false);
    }
  };

  // 2. USB Wizard Flow
  const handleStartUsb = async () => {
    setIsWizardLoading(true);
    setWizardNotice(null);
    try {
      const usbPrinter = await webDirectPrintService.detectUsbPrinter(
        { role: wizardRole, paperWidth: '80mm', isPrimary: wizardIsPrimary },
        restaurantId
      );

      if (usbPrinter.status === 'unsupported') {
        // Windows driver owns the USB interface -> Transition to Windows Print Agent
        if (pairedAgent) {
          setWizardStep('windows_select');
          setWizardNotice(
            `Your USB printer ("${usbPrinter.name}") is managed by a Windows driver. Please select its queue via Print Agent below.`
          );
        } else {
          setWizardStep('windows_agent_pair');
          setWizardNotice(
            `Your USB printer is managed by a Windows driver. Please pair the RestroZ Print Agent to print silently to this device.`
          );
        }
      } else {
        setPendingPrinter(usbPrinter);
        setWizardPaperWidth(usbPrinter.paperWidth || '80mm');
        setWizardStep('configure_test');
        showToast('success', 'USB Connected', `Connected to "${usbPrinter.name}" via Direct WebUSB!`);
      }
    } catch (err: any) {
      setWizardNotice(err.message || 'USB connection failed or was cancelled.');
    } finally {
      setIsWizardLoading(false);
    }
  };

  // 3. Web Serial Wizard Flow
  const handleStartSerial = async () => {
    setIsWizardLoading(true);
    setWizardNotice(null);
    try {
      const serialPrinter = await webDirectPrintService.pairSerialPrinter(
        { role: wizardRole, paperWidth: '80mm', isPrimary: wizardIsPrimary },
        restaurantId
      );
      setPendingPrinter(serialPrinter);
      setWizardPaperWidth('80mm');
      setWizardStep('configure_test');
      showToast('success', 'Serial Port Connected', `Connected to "${serialPrinter.name}" via Web Serial!`);
    } catch (err: any) {
      setWizardNotice(err.message || 'Serial port connection failed or was cancelled.');
    } finally {
      setIsWizardLoading(false);
    }
  };

  // Android Bluetooth Discovery & Pairing Flow
  const handleStartBluetoothAndroid = async () => {
    setWizardStep('android_bluetooth_scan');
    setIsScanningBt(true);
    setBtScanComplete(false);
    setWizardNotice(null);
    setDiscoveredBluetoothDevices([]);
    try {
      const devices = await printerManager.getUnifiedBluetoothDevices({
        timeoutMs: 12000,
        onProgress: (live) => {
          setDiscoveredBluetoothDevices([...live]);
        },
      });
      setDiscoveredBluetoothDevices(devices);
      if (devices.length === 0) {
        setWizardNotice('No Bluetooth devices found. Ensure printer is ON and Bluetooth is enabled in Android Settings.');
      }
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg === 'BLUETOOTH_POWERED_OFF' || /power|disabled|turn on/i.test(msg)) {
        setWizardNotice('Bluetooth is turned OFF. Please turn ON Bluetooth in Android Settings and try again.');
      } else if (msg === 'BLUETOOTH_PERMISSION_DENIED' || /permission/i.test(msg)) {
        setWizardNotice('Bluetooth permissions are required to scan printers. Please allow permissions in Android Settings.');
      } else {
        setWizardNotice(err?.message || 'Bluetooth scan failed.');
      }
    } finally {
      setIsScanningBt(false);
      setBtScanComplete(true);
    }
  };

  const handleSelectBtDevice = (device: BluetoothDeviceInfo) => {
    setSelectedBtDevice(device);
    const isSeznik = /seznik|925|9394/i.test(device.name || '');
    const is58 = isSeznik || /58/i.test(device.name || '');
    const pWidth: DirectPaperWidth = is58 ? '58mm' : '80mm';
    const printerId = `bt_${(device.address || 'printer').replace(/[^a-zA-Z0-9]/g, '_')}`;

    const configured: ConfiguredDirectPrinter = {
      id: printerId,
      name: device.name || 'Bluetooth Thermal Printer',
      transport: 'bluetooth',
      deviceId: device.address,
      bluetoothDeviceId: device.address,
      paperWidth: pWidth,
      role: wizardRole,
      isPrimary: wizardIsPrimary || printers.length === 0,
      status: 'connected',
    };

    setPendingPrinter(configured);
    setWizardPaperWidth(pWidth);
    setWizardStep('configure_test');
  };

  // Android USB Detection Flow
  const handleStartUsbAndroid = async () => {
    setWizardStep('android_usb_select');
    setIsWizardLoading(true);
    setWizardNotice(null);
    try {
      const devices = await printerManager.getAttachedUsbDevices();
      setDiscoveredUsbDevices(devices);
      if (devices.length === 0) {
        setWizardNotice('No USB thermal printers detected. Connect printer via USB OTG cable and power it on.');
      }
    } catch (err: any) {
      setWizardNotice(err?.message || 'Failed to detect USB devices.');
    } finally {
      setIsWizardLoading(false);
    }
  };

  const handleSelectUsbDevice = (device: UsbDeviceInfo) => {
    setPendingUsbInfo(device);
    const is58 = /58/i.test(device.deviceName || '');
    const pWidth: DirectPaperWidth = is58 ? '58mm' : '80mm';
    const printerId = `usb_${device.vendorId}_${device.productId}`;

    const configured: ConfiguredDirectPrinter = {
      id: printerId,
      name: device.deviceName || `USB Printer (${device.vendorId}:${device.productId})`,
      transport: 'usb',
      deviceId: String(device.deviceId),
      vendorId: device.vendorId,
      productId: device.productId,
      serialNumber: device.serialNumber,
      paperWidth: pWidth,
      role: wizardRole,
      isPrimary: wizardIsPrimary || printers.length === 0,
      status: 'connected',
    };

    setPendingPrinter(configured);
    setWizardPaperWidth(pWidth);
    setWizardStep('configure_test');
  };

  // Android Network (LAN / Wi-Fi) Flow
  const handleStartNetworkAndroid = () => {
    setWizardStep('android_network_input');
    setWizardNotice(null);
    setIpAddressInput('');
    setPortInput('9100');
  };

  const handleConfirmNetwork = () => {
    const ip = ipAddressInput.trim();
    if (!ip) {
      setWizardNotice('Please enter the printer IP address (e.g. 192.168.1.100).');
      return;
    }
    const port = parseInt(portInput.trim() || '9100', 10);
    const printerId = `net_${ip.replace(/[^a-zA-Z0-9]/g, '_')}_${port}`;

    const configured: ConfiguredDirectPrinter = {
      id: printerId,
      name: `Network Printer (${ip})`,
      transport: 'lan' as any,
      deviceId: `${ip}:${port}`,
      paperWidth: wizardPaperWidth,
      role: wizardRole,
      isPrimary: wizardIsPrimary || printers.length === 0,
      status: 'connected',
    };

    setPendingPrinter(configured);
    setWizardStep('configure_test');
  };

  const [isPollingQueues, setIsPollingQueues] = useState(false);

  const pollAgentQueues = useCallback(async (agentId: string) => {
    setIsPollingQueues(true);
    try {
      for (let i = 0; i < 6; i++) {
        const queues = await webDirectPrintService.refreshAgentQueues(agentId);
        if (queues.length > 0) {
          setPairedAgent((prev) => (prev ? { ...prev, installedPrinters: queues } : null));
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    } finally {
      setIsPollingQueues(false);
    }
  }, []);

  // 4. Windows Printer Agent Wizard Flow
  const handleStartWindows = async () => {
    setWizardNotice(null);
    setIsWizardLoading(true);
    try {
      const latestAgent = await webDirectPrintService.getPairedAgent(restaurantId);
      setPairedAgent(latestAgent);
      if (latestAgent) {
        setWizardStep('windows_select');
        if ((latestAgent.installedPrinters || []).length === 0) {
          pollAgentQueues(latestAgent.id);
        }
      } else {
        setWizardStep('windows_agent_pair');
        // Auto-detect running desktop Print Agent if available
        try {
          const detected = await webDirectPrintService.detectRunningPrintAgent();
          if (detected && detected.pairingCode) {
            setPairingCodeInput(detected.pairingCode);
            setDetectedAgentName(detected.deviceName);
          }
        } catch (_) {}
      }
    } finally {
      setIsWizardLoading(false);
    }
  };

  // Manual trigger for auto-detecting desktop print agent code
  const handleAutoDetectAgentCode = async () => {
    setIsDetectingAgent(true);
    try {
      const detected = await webDirectPrintService.detectRunningPrintAgent();
      if (detected && detected.pairingCode) {
        setPairingCodeInput(detected.pairingCode);
        setDetectedAgentName(detected.deviceName);
        showToast('success', 'Print Agent Detected', `Auto-detected code from ${detected.deviceName}!`);
      } else {
        showToast('info', 'No Agent Detected', 'Make sure RestroZ Print Agent is running on this computer.');
      }
    } catch (err: any) {
      showToast('error', 'Detection Failed', err.message || 'Could not detect Print Agent.');
    } finally {
      setIsDetectingAgent(false);
    }
  };

  // Poll for active desktop print agent while on pairing step
  useEffect(() => {
    if (wizardStep === 'windows_agent_pair') {
      let isMounted = true;
      const checkAgent = async () => {
        try {
          const detected = await webDirectPrintService.detectRunningPrintAgent();
          if (isMounted && detected && detected.pairingCode) {
            setPairingCodeInput((prev) => prev || detected.pairingCode);
            setDetectedAgentName(detected.deviceName);
          }
        } catch (_) {}
      };

      checkAgent();
      const interval = setInterval(() => {
        if (!pairingCodeInput) {
          checkAgent();
        }
      }, 3000);

      return () => {
        isMounted = false;
        clearInterval(interval);
      };
    } else {
      setDetectedAgentName(null);
    }
  }, [wizardStep, pairingCodeInput]);

  // Pair Agent with pairing code
  const handlePairAgentSubmit = async () => {
    if (!pairingCodeInput || !pairingCodeInput.trim()) {
      setWizardNotice('Please enter the 6-digit pairing code displayed on your Print Agent.');
      return;
    }
    setIsPairingAgent(true);
    setWizardNotice(null);
    try {
      const agent = await webDirectPrintService.pairPrintAgent(pairingCodeInput, restaurantId);
      setPairedAgent(agent);
      showToast('success', 'Print Agent Paired', `Successfully paired with ${agent.deviceName}!`);
      setWizardStep('windows_select');
      if ((agent.installedPrinters || []).length === 0) {
        pollAgentQueues(agent.id);
      }
    } catch (err: any) {
      setWizardNotice(err.message || 'Failed to pair Print Agent. Check code and ensure agent is running.');
    } finally {
      setIsPairingAgent(false);
    }
  };

  // Unpair Agent
  const handleUnpairAgent = async () => {
    if (!pairedAgent || !canManage) return;
    setIsUnpairingAgent(true);
    try {
      await webDirectPrintService.unpairPrintAgent(pairedAgent.id, restaurantId);
      setPairedAgent(null);
      showToast('info', 'Print Agent Disconnected', 'RestroZ Print Agent was unlinked from this restaurant.');
      await loadPrintersAndAgent();
    } catch (err: any) {
      showToast('error', 'Disconnect Failed', err.message || 'Could not unpair Print Agent.');
    } finally {
      setIsUnpairingAgent(false);
    }
  };

  // Select Windows Queue from Agent
  const handleSelectWindowsQueue = async (queueName: string) => {
    if (!pairedAgent) return;
    setSelectedWindowsPrinter(queueName);
    setIsWizardLoading(true);
    try {
      const agentPrinter = await webDirectPrintService.addAgentPrinter(
        queueName,
        pairedAgent,
        { role: wizardRole, paperWidth: wizardPaperWidth, isPrimary: wizardIsPrimary },
        restaurantId
      );
      setLocalKotPrinter(queueName, restaurantId);
      setPendingPrinter(agentPrinter);
      setWizardStep('configure_test');
    } catch (err: any) {
      setWizardNotice(err.message || 'Failed to configure Windows printer queue.');
    } finally {
      setIsWizardLoading(false);
    }
  };

  // Wizard Test Print
  const handleWizardTestPrint = async () => {
    if (!pendingPrinter) return;
    setIsWizardLoading(true);
    try {
      if (Platform.OS === 'web') {
        const updatedPending: ConfiguredDirectPrinter = {
          ...pendingPrinter,
          role: wizardRole,
          paperWidth: wizardPaperWidth,
          isPrimary: wizardIsPrimary,
        };
        const result = await webDirectPrintService.printTest(updatedPending, settings, restaurantId);
        showToast('success', 'Test Print Sent', result.message || 'Test receipt dispatched successfully!');
        const updatedList = webDirectPrintService.getSavedPrinters(restaurantId);
        setPrinters(updatedList);
      } else {
        const isSeznik =
          /seznik|925|9394/i.test(pendingPrinter.name) ||
          /seznik|925|9394/i.test(selectedBtDevice?.name || '');
        const isBle = isSeznik || selectedBtDevice?.transportType === 'ble_gatt';

        const connType: any =
          pendingPrinter.transport === 'usb'
            ? 'usb'
            : (pendingPrinter.transport as string) === 'lan' || (pendingPrinter.transport as any) === 'wifi'
            ? 'lan'
            : 'bluetooth';

        const tempPrinter: RestaurantPrinter = {
          id: pendingPrinter.id,
          restaurant_id: restaurantId,
          name: pendingPrinter.name,
          connection_type: connType,
          paper_width: wizardPaperWidth as any,
          printer_role: wizardRole as any,
          is_active: true,
          is_primary: wizardIsPrimary,
          bluetooth_device_name: selectedBtDevice?.name || pendingPrinter.name,
          ip_address: pendingPrinter.deviceId?.includes('.') ? pendingPrinter.deviceId.split(':')[0] : undefined,
          port: pendingPrinter.deviceId?.includes(':') ? parseInt(pendingPrinter.deviceId.split(':')[1], 10) : undefined,
          alignment: 'center',
          horizontal_shift_mm: 0,
          margin_left_mm: 0,
          margin_right_mm: 0,
          margin_top_mm: 0,
          margin_bottom_mm: 0,
        };

        if (pendingPrinter.transport === 'bluetooth') {
          await devicePrinterBindingService.saveDeviceBinding({
            restaurant_printer_id: tempPrinter.id,
            connection_type: 'bluetooth',
            bluetooth_mac_address: pendingPrinter.bluetoothDeviceId || pendingPrinter.deviceId || selectedBtDevice?.address,
            bluetooth_device_name: selectedBtDevice?.name || pendingPrinter.name,
            bluetooth_transport_type: isBle ? 'ble_gatt' : 'spp',
          });
        } else if (pendingPrinter.transport === 'usb' && pendingUsbInfo) {
          await devicePrinterBindingService.saveDeviceBinding({
            restaurant_printer_id: tempPrinter.id,
            connection_type: 'usb',
            usb_vendor_id: pendingUsbInfo.vendorId,
            usb_product_id: pendingUsbInfo.productId,
            usb_serial_number: pendingUsbInfo.serialNumber,
          });
        }

        const result = await printerManager.printTestReceipt(tempPrinter);
        if (result.success) {
          showToast('success', 'Test Print Sent', result.message || 'Test receipt dispatched successfully!');
        } else {
          showToast('error', 'Test Print Failed', result.message || 'Could not print test receipt.');
        }
      }
    } catch (err: any) {
      showToast('error', 'Test Print Failed', err.message || 'Test print failed.');
    } finally {
      setIsWizardLoading(false);
    }
  };

  // Save Wizard Printer
  const handleFinishWizard = async () => {
    if (!pendingPrinter) {
      setWizardVisible(false);
      return;
    }
    if (Platform.OS === 'web') {
      const updated: ConfiguredDirectPrinter = {
        ...pendingPrinter,
        role: wizardRole,
        paperWidth: wizardPaperWidth,
        isPrimary: wizardIsPrimary,
      };
      webDirectPrintService.updatePrinter(updated, restaurantId);
      if (updated.transport === 'agent' && (wizardIsPrimary || updated.isPrimary)) {
        const qName = updated.windowsQueueName || updated.name;
        if (updated.role === 'kot' || updated.role === 'both') {
          setLocalKotPrinter(qName, restaurantId);
        } else {
          setLocalKotPrinter('', restaurantId);
        }
        if (updated.role === 'bill' || updated.role === 'both') {
          setLocalBillPrinter(qName, restaurantId);
        } else {
          setLocalBillPrinter('', restaurantId);
        }
      }
      await loadPrintersAndAgent();
      setWizardVisible(false);
      showToast('success', 'Printer Setup Complete', `"${updated.name}" is now ready for POS printing.`);
    } else {
      const isSeznik =
        /seznik|925|9394/i.test(pendingPrinter.name) ||
        /seznik|925|9394/i.test(selectedBtDevice?.name || '');
      const isBle = isSeznik || selectedBtDevice?.transportType === 'ble_gatt';

      const connType: any =
        pendingPrinter.transport === 'usb'
          ? 'usb'
          : (pendingPrinter.transport as string) === 'lan' || (pendingPrinter.transport as any) === 'wifi'
          ? 'lan'
          : 'bluetooth';

      const restaurantPrinter: RestaurantPrinter = {
        id: pendingPrinter.id,
        restaurant_id: restaurantId,
        name: pendingPrinter.name,
        connection_type: connType,
        paper_width: wizardPaperWidth as any,
        printer_role: wizardRole as any,
        is_active: true,
        is_primary: wizardIsPrimary,
        bluetooth_device_name: selectedBtDevice?.name || pendingPrinter.name,
        ip_address: pendingPrinter.deviceId?.includes('.') ? pendingPrinter.deviceId.split(':')[0] : undefined,
        port: pendingPrinter.deviceId?.includes(':') ? parseInt(pendingPrinter.deviceId.split(':')[1], 10) : undefined,
        alignment: 'center',
        horizontal_shift_mm: 0,
        margin_left_mm: 0,
        margin_right_mm: 0,
        margin_top_mm: 0,
        margin_bottom_mm: 0,
      };

      await devicePrinterBindingService.saveDevicePrinter(restaurantPrinter);

      if (pendingPrinter.transport === 'bluetooth') {
        await devicePrinterBindingService.saveDeviceBinding({
          restaurant_printer_id: restaurantPrinter.id,
          connection_type: 'bluetooth',
          bluetooth_mac_address: pendingPrinter.bluetoothDeviceId || pendingPrinter.deviceId || selectedBtDevice?.address,
          bluetooth_device_name: selectedBtDevice?.name || pendingPrinter.name,
          bluetooth_transport_type: isBle ? 'ble_gatt' : 'spp',
        });
      } else if (pendingPrinter.transport === 'usb' && pendingUsbInfo) {
        await devicePrinterBindingService.saveDeviceBinding({
          restaurant_printer_id: restaurantPrinter.id,
          connection_type: 'usb',
          usb_vendor_id: pendingUsbInfo.vendorId,
          usb_product_id: pendingUsbInfo.productId,
          usb_serial_number: pendingUsbInfo.serialNumber,
        });
      }

      if (wizardIsPrimary) {
        const defaults = await devicePrinterBindingService.getDeviceDefaults();
        if (wizardRole === 'kot' || wizardRole === 'both') {
          defaults.default_kot_printer_id = restaurantPrinter.id;
        }
        if (wizardRole === 'bill' || wizardRole === 'both') {
          defaults.default_bill_printer_id = restaurantPrinter.id;
        }
        await devicePrinterBindingService.saveDeviceDefaults(defaults);
      }

      await devicePrinterBindingService.setDevicePrintMode('DIRECT_DEVICE');
      await loadPrintersAndAgent();
      setWizardVisible(false);
      showToast('success', 'Printer Setup Complete', `"${restaurantPrinter.name}" is now ready for POS printing.`);
    }
  };

  // Card Action Handlers
  const handleCardTestPrint = async (printer: ConfiguredDirectPrinter) => {
    setTestingPrinterId(printer.id);
    try {
      if (Platform.OS === 'web') {
        console.log(
          `[PRINTER_IDENTITY_AUDIT]\n` +
          `UI Printer ID: ${printer.id}\n` +
          `UI Printer Name: ${printer.name}\n` +
          `UI deviceId: ${printer.deviceId || 'N/A'}\n` +
          `UI bluetoothDeviceId: ${printer.bluetoothDeviceId || 'N/A'}`
        );
        const result = await webDirectPrintService.printTest(printer, settings, restaurantId);
        showToast('success', 'Test Print Sent', result.message || 'Test print dispatched successfully!');
        const updatedList = webDirectPrintService.getSavedPrinters(restaurantId);
        setPrinters(updatedList);
      } else {
        const devicePrinters = await devicePrinterBindingService.getDevicePrinters();
        const binding = await devicePrinterBindingService.getDeviceBinding(printer.id);
        let target = devicePrinters.find((p) => p.id === printer.id);
        if (!target) {
          const connType: any =
            printer.transport === 'usb'
              ? 'usb'
              : (printer.transport as string) === 'lan' || (printer.transport as any) === 'wifi'
              ? 'lan'
              : 'bluetooth';
          target = {
            id: printer.id,
            restaurant_id: restaurantId,
            name: printer.name,
            connection_type: connType,
            paper_width: printer.paperWidth as any,
            printer_role: printer.role as any,
            is_active: true,
            is_primary: Boolean(printer.isPrimary),
            bluetooth_device_name: binding?.bluetooth_device_name || printer.name,
            ip_address: printer.deviceId?.includes('.') ? printer.deviceId.split(':')[0] : undefined,
            alignment: 'center',
            horizontal_shift_mm: 0,
            margin_left_mm: 0,
            margin_right_mm: 0,
            margin_top_mm: 0,
            margin_bottom_mm: 0,
          };
        }
        const result = await printerManager.printTestReceipt(target);
        if (result.success) {
          showToast('success', 'Test Print Sent', result.message || 'Test print dispatched successfully!');
        } else {
          showToast('error', 'Test Print Failed', result.message || 'Failed to print test receipt.');
        }
      }
    } catch (err: any) {
      showToast('error', 'Test Print Failed', err.message || 'Failed to print test receipt.');
    } finally {
      setTestingPrinterId(null);
    }
  };

  const handleDisconnect = async (printer: ConfiguredDirectPrinter) => {
    if (!canManage) return;
    try {
      if (Platform.OS === 'web') {
        await webDirectPrintService.disconnectPrinter(printer.id, restaurantId);
        const updatedList = webDirectPrintService.getSavedPrinters(restaurantId);
        setPrinters(updatedList);
      } else {
        await devicePrinterBindingService.removeDevicePrinter(printer.id);
      }
      showToast('info', 'Printer Removed', `Removed "${printer.name}" from configured printers.`);
      await loadPrintersAndAgent();
    } catch (err: any) {
      showToast('error', 'Disconnect Error', err.message || 'Could not remove printer.');
    }
  };

  const handleOpenEdit = (printer: ConfiguredDirectPrinter) => {
    setEditingPrinter(printer);
    setEditRole(printer.role);
    setEditPaperWidth(printer.paperWidth);
    setEditIsPrimary(Boolean(printer.isPrimary));
  };

  const handleSaveEdit = async () => {
    if (!editingPrinter) return;
    if (Platform.OS === 'web') {
      const updated: ConfiguredDirectPrinter = {
        ...editingPrinter,
        role: editRole,
        paperWidth: editPaperWidth,
        isPrimary: editIsPrimary,
      };
      webDirectPrintService.updatePrinter(updated, restaurantId);
      if (updated.transport === 'agent' && (editIsPrimary || editingPrinter.isPrimary)) {
        const qName = updated.windowsQueueName || updated.name;
        if (updated.role === 'kot' || updated.role === 'both') {
          setLocalKotPrinter(qName, restaurantId);
        } else {
          setLocalKotPrinter('', restaurantId);
        }
        if (updated.role === 'bill' || updated.role === 'both') {
          setLocalBillPrinter(qName, restaurantId);
        } else {
          setLocalBillPrinter('', restaurantId);
        }
      }
    } else {
      const currentPrinters = await devicePrinterBindingService.getDevicePrinters();
      const existing = currentPrinters.find((p) => p.id === editingPrinter.id);
      if (existing) {
        const updatedPrinter: RestaurantPrinter = {
          ...existing,
          printer_role: editRole as any,
          paper_width: editPaperWidth as any,
          is_primary: editIsPrimary,
        };
        await devicePrinterBindingService.saveDevicePrinter(updatedPrinter);

        const defaults = await devicePrinterBindingService.getDeviceDefaults();
        if (editIsPrimary) {
          if (editRole === 'kot' || editRole === 'both') {
            defaults.default_kot_printer_id = updatedPrinter.id;
          }
          if (editRole === 'bill' || editRole === 'both') {
            defaults.default_bill_printer_id = updatedPrinter.id;
          }
        } else {
          if (defaults.default_kot_printer_id === updatedPrinter.id && editRole !== 'kot' && editRole !== 'both') {
            defaults.default_kot_printer_id = undefined;
          }
          if (defaults.default_bill_printer_id === updatedPrinter.id && editRole !== 'bill' && editRole !== 'both') {
            defaults.default_bill_printer_id = undefined;
          }
        }
        await devicePrinterBindingService.saveDeviceDefaults(defaults);
      }
    }
    setEditingPrinter(null);
    showToast('success', 'Printer Updated', `Configuration updated for "${editingPrinter.name}".`);
    await loadPrintersAndAgent();
  };

  const getStatusBadge = (printer: ConfiguredDirectPrinter) => {
    if (printer.status === 'connected' || printer.status === 'available') {
      return (
        <View style={styles.badgeConnected}>
          <Text style={styles.badgeConnectedText}>● READY</Text>
        </View>
      );
    }
    if (printer.status === 'disconnected') {
      return (
        <View style={styles.badgeWarning}>
          <Text style={styles.badgeWarningText}>⚠ DISCONNECTED</Text>
        </View>
      );
    }
    if (printer.status === 'offline') {
      return (
        <View style={styles.badgeOffline}>
          <Text style={styles.badgeOfflineText}>○ OFFLINE</Text>
        </View>
      );
    }
    if (printer.status === 'reconnect_required') {
      return (
        <View style={styles.badgeWarning}>
          <Text style={styles.badgeWarningText}>⚠ RECONNECT REQUIRED</Text>
        </View>
      );
    }
    return (
      <View style={styles.badgeError}>
        <Text style={styles.badgeErrorText}>✕ UNSUPPORTED</Text>
      </View>
    );
  };

  const getTransportBadge = (transport: string) => {
    switch (transport) {
      case 'bluetooth':
        return <Text style={styles.transportBadgeBt}>BLUETOOTH</Text>;
      case 'usb':
        return <Text style={styles.transportBadgeUsb}>USB DIRECT</Text>;
      case 'serial':
        return <Text style={styles.transportBadgeSerial}>WEB SERIAL (COM)</Text>;
      case 'agent':
        return <Text style={styles.transportBadgeAgent}>RESTROZ PRINT AGENT</Text>;
      case 'lan':
      case 'wifi':
        return <Text style={styles.transportBadgeTcp}>NETWORK (LAN/WIFI)</Text>;
      default:
        return <Text style={styles.transportBadge}>{transport.toUpperCase()}</Text>;
    }
  };

  const availableQueues = (pairedAgent?.installedPrinters || []).filter((q) =>
    wizardSearchQuery ? q.toLowerCase().includes(wizardSearchQuery.toLowerCase()) : true
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleBox}>
          <Text style={styles.title}>Printer Devices</Text>
          <Text style={styles.subtitle}>
            {Platform.OS === 'web'
              ? 'Connect thermal receipt printers via Web Bluetooth, WebUSB, Serial, or RestroZ Print Agent.'
              : 'Connect thermal receipt printers via Bluetooth (BLE/SPP), USB OTG, or Network LAN.'}
          </Text>
        </View>
        {canManage && (
          <TouchableOpacity
            testID="connect-printer-btn"
            style={styles.addBtn}
            onPress={handleOpenWizard}
          >
            <Text style={styles.addBtnText}>+ Connect Printer</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Paired Windows Print Agent Banner */}
      {pairedAgent && (
        <View style={styles.agentBanner}>
          <View style={styles.agentInfoRow}>
            <View style={styles.agentLeftCol}>
              <View style={styles.agentTitleRow}>
                <Text style={styles.agentName}>{pairedAgent.deviceName}</Text>
                <View style={pairedAgent.status === 'online' ? styles.agentOnlineBadge : styles.agentOfflineBadge}>
                  <Text style={pairedAgent.status === 'online' ? styles.agentOnlineText : styles.agentOfflineText}>
                    {pairedAgent.status === 'online' ? '● PRINT AGENT READY' : '○ PRINT AGENT OFFLINE'}
                  </Text>
                </View>
              </View>
              <Text style={styles.agentSub}>
                Installed Windows Queues:{' '}
                {pairedAgent.installedPrinters && pairedAgent.installedPrinters.length > 0
                  ? `${pairedAgent.installedPrinters.length} (${pairedAgent.installedPrinters.join(', ')})`
                  : isPollingQueues
                  ? 'Loading Windows printers...'
                  : 'Scanning...'}
              </Text>
            </View>
            <View style={styles.agentActionsRow}>
              {canManage && (
                <TouchableOpacity
                  style={[styles.smallRefreshBtn, isPollingQueues && { opacity: 0.6 }]}
                  onPress={() => pairedAgent && pollAgentQueues(pairedAgent.id)}
                  disabled={isPollingQueues}
                >
                  <Text style={styles.smallRefreshBtnText}>⟳ Refresh Queues</Text>
                </TouchableOpacity>
              )}
              {canManage && (
                <TouchableOpacity
                  style={styles.unpairBtn}
                  onPress={handleUnpairAgent}
                  disabled={isUnpairingAgent}
                >
                  {isUnpairingAgent ? (
                    <ActivityIndicator color="#ef4444" size="small" />
                  ) : (
                    <Text style={styles.unpairBtnText}>Disconnect</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Loading */}
      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#f97316" size="small" />
          <Text style={styles.loadingText}>Loading printer devices...</Text>
        </View>
      ) : printers.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No Printers Connected</Text>
          <Text style={styles.emptyText}>
            {Platform.OS === 'web'
              ? 'Click "+ Connect Printer" above to pair a Bluetooth, USB, Serial, or Windows Print Agent thermal printer.'
              : 'Click "+ Connect Printer" above to pair a Bluetooth (BLE/SPP), USB, or Network thermal printer.'}
          </Text>
        </View>
      ) : (
        <View style={styles.printerList}>
          {printers.map((p) => (
            <View key={p.id} style={styles.printerCard}>
              <View style={styles.printerHeader}>
                <View style={styles.printerInfoCol}>
                  <View style={styles.printerNameRow}>
                    <Text style={styles.printerName}>{p.name}</Text>
                    {p.isPrimary && (
                      <Text
                        style={
                          p.status === 'reconnect_required' || p.status === 'disconnected'
                            ? styles.primaryWarningBadge
                            : p.status === 'offline' || p.status === 'unsupported'
                            ? styles.primaryOfflineBadge
                            : styles.primaryBadge
                        }
                      >
                        {p.status === 'disconnected'
                          ? 'PRIMARY • DISCONNECTED'
                          : p.status === 'reconnect_required'
                          ? 'PRIMARY • RECONNECT REQUIRED'
                          : p.status === 'offline'
                          ? 'PRIMARY • OFFLINE'
                          : p.status === 'unsupported'
                          ? 'PRIMARY • UNSUPPORTED'
                          : 'PRIMARY • READY'}
                      </Text>
                    )}
                  </View>
                  <View style={styles.metaRow}>
                    {getTransportBadge(p.transport)}
                    <Text style={styles.metaText}>•</Text>
                    <Text style={styles.metaText}>{p.paperWidth}</Text>
                    <Text style={styles.metaText}>•</Text>
                    <Text style={styles.metaText}>{p.role.toUpperCase()}</Text>
                  </View>
                </View>
                <View style={styles.printerStatusBox}>
                  {getStatusBadge(p)}
                </View>
              </View>

              {p.statusMessage ? (
                <Text style={styles.statusMessage}>{p.statusMessage}</Text>
              ) : null}

              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={[styles.cardBtn, styles.testBtn]}
                  onPress={() => handleCardTestPrint(p)}
                  disabled={testingPrinterId === p.id}
                >
                  {testingPrinterId === p.id ? (
                    <ActivityIndicator color="#22c55e" size="small" />
                  ) : (
                    <Text style={styles.testBtnText}>Test Print</Text>
                  )}
                </TouchableOpacity>

                {canManage && (
                  <>
                    <TouchableOpacity
                      style={[styles.cardBtn, styles.editBtn]}
                      onPress={() => handleOpenEdit(p)}
                    >
                      <Text style={styles.editBtnText}>Configure</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.cardBtn, styles.deleteBtn]}
                      onPress={() => handleDisconnect(p)}
                    >
                      <Text style={styles.deleteBtnText}>Disconnect</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ========================================================================= */}
      {/* CONNECTION WIZARD MODAL */}
      {/* ========================================================================= */}
      <Modal visible={wizardVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.wizardModal}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {wizardStep === 'choose_type' && 'Connect New Printer'}
                {wizardStep === 'android_bluetooth_scan' && 'Scan Bluetooth Printers'}
                {wizardStep === 'android_usb_select' && 'Select USB Printer'}
                {wizardStep === 'android_network_input' && 'Enter Network Printer Details'}
                {wizardStep === 'windows_agent_pair' && 'Pair RestroZ Print Agent'}
                {wizardStep === 'windows_select' && 'Select Windows Printer Queue'}
                {wizardStep === 'configure_test' && 'Configure & Test Printer'}
              </Text>
              <TouchableOpacity onPress={() => setWizardVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Wizard Notice */}
            {wizardNotice ? (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}>{wizardNotice}</Text>
              </View>
            ) : null}

            {/* STEP 1: CHOOSE TYPE */}
            {wizardStep === 'choose_type' && (
              <View style={styles.wizardBody}>
                <Text style={styles.stepTitle}>Select your printer connection type:</Text>

                {Platform.OS === 'web' ? (
                  <>
                    {/* Option 1: Web Bluetooth */}
                    <TouchableOpacity
                      style={[styles.optionCard, !isBtSupported && styles.optionDisabled]}
                      onPress={handleStartBluetooth}
                      disabled={isWizardLoading || !isBtSupported}
                    >
                      <Text style={styles.optionTitle}>Bluetooth Printer</Text>
                      <Text style={styles.optionDesc}>
                        Direct connection to BLE 58mm / 80mm thermal printers using Chrome / Edge Web Bluetooth.
                      </Text>
                    </TouchableOpacity>

                    {/* Option 2: Direct USB */}
                    <TouchableOpacity
                      style={[styles.optionCard, !isUsbSupported && styles.optionDisabled]}
                      onPress={handleStartUsb}
                      disabled={isWizardLoading || !isUsbSupported}
                    >
                      <Text style={styles.optionTitle}>USB Printer</Text>
                      <Text style={styles.optionDesc}>
                        Direct connection to USB ESC/POS thermal printers via WebUSB.
                      </Text>
                    </TouchableOpacity>

                    {/* Option 3: Web Serial / COM */}
                    <TouchableOpacity
                      style={[styles.optionCard, !isSerialSupported && styles.optionDisabled]}
                      onPress={handleStartSerial}
                      disabled={isWizardLoading || !isSerialSupported}
                    >
                      <Text style={styles.optionTitle}>Serial / COM Port Printer</Text>
                      <Text style={styles.optionDesc}>
                        Direct connection to printers exposed on a serial/COM port via Web Serial.
                      </Text>
                    </TouchableOpacity>

                    {/* Option 4: Windows Printer (Print Agent) */}
                    <TouchableOpacity
                      style={styles.optionCard}
                      onPress={handleStartWindows}
                      disabled={isWizardLoading}
                    >
                      <Text style={styles.optionTitle}>Windows Printer (RestroZ Print Agent)</Text>
                      <Text style={styles.optionDesc}>
                        Silent thermal printing to any Windows driver queue (POS58, POS80, EPSON) via lightweight Print Agent.
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    {/* Option 1: Android Bluetooth */}
                    <TouchableOpacity
                      style={styles.optionCard}
                      onPress={handleStartBluetoothAndroid}
                      disabled={isWizardLoading}
                    >
                      <Text style={styles.optionTitle}>Bluetooth Printer (BLE & Classic)</Text>
                      <Text style={styles.optionDesc}>
                        Scan and pair nearby Bluetooth thermal receipt printers (Seznik, RPP02N, PT-210, MPT-II, POS-58, POS-80).
                      </Text>
                    </TouchableOpacity>

                    {/* Option 2: Android USB OTG */}
                    <TouchableOpacity
                      style={styles.optionCard}
                      onPress={handleStartUsbAndroid}
                      disabled={isWizardLoading}
                    >
                      <Text style={styles.optionTitle}>USB Printer (OTG / Host)</Text>
                      <Text style={styles.optionDesc}>
                        Direct connection to USB ESC/POS thermal printers connected via USB OTG cable.
                      </Text>
                    </TouchableOpacity>

                    {/* Option 3: Android Network LAN */}
                    <TouchableOpacity
                      style={styles.optionCard}
                      onPress={handleStartNetworkAndroid}
                      disabled={isWizardLoading}
                    >
                      <Text style={styles.optionTitle}>Network Printer (LAN / Wi-Fi)</Text>
                      <Text style={styles.optionDesc}>
                        Connect to ESC/POS thermal printer over local Wi-Fi or Ethernet network (Port 9100).
                      </Text>
                    </TouchableOpacity>

                    {/* Option 4: Desktop Print Agent (Optional) */}
                    <TouchableOpacity
                      style={styles.optionCard}
                      onPress={handleStartWindows}
                      disabled={isWizardLoading}
                    >
                      <Text style={styles.optionTitle}>Windows Print Agent (Central Station)</Text>
                      <Text style={styles.optionDesc}>
                        Pair with a desktop RestroZ Print Agent if using a central PC station.
                      </Text>
                    </TouchableOpacity>
                  </>
                )}

                {isWizardLoading && (
                  <View style={styles.wizardLoadingOverlay}>
                    <ActivityIndicator color="#f97316" size="large" />
                    <Text style={styles.wizardLoadingText}>Connecting hardware...</Text>
                  </View>
                )}
              </View>
            )}

            {/* STEP: ANDROID BLUETOOTH SCAN */}
            {wizardStep === 'android_bluetooth_scan' && (
              <View style={styles.wizardBody}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={[styles.stepTitle, { flex: 1, marginBottom: 0 }]}>
                    Discovered Bluetooth Printers:
                  </Text>
                  <TouchableOpacity
                    style={[styles.smallRefreshBtn, isScanningBt && { opacity: 0.6 }]}
                    onPress={handleStartBluetoothAndroid}
                    disabled={isScanningBt}
                  >
                    <Text style={styles.smallRefreshBtnText}>⟳ Rescan</Text>
                  </TouchableOpacity>
                </View>

                {isScanningBt ? (
                  <View style={{ padding: 24, alignItems: 'center', gap: 12 }}>
                    <ActivityIndicator color="#f97316" size="large" />
                    <Text style={{ color: '#a1a1aa', fontSize: 13 }}>Scanning nearby Bluetooth printers...</Text>
                  </View>
                ) : discoveredBluetoothDevices.length === 0 ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={styles.emptyQueueText}>
                      No Bluetooth devices found. Ensure your thermal printer is turned ON, within range, and Bluetooth is enabled.
                    </Text>
                    <TouchableOpacity
                      style={[styles.primaryActionBtn, { marginTop: 12, paddingHorizontal: 20 }]}
                      onPress={handleStartBluetoothAndroid}
                    >
                      <Text style={styles.primaryActionBtnText}>Retry Scan</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <ScrollView style={styles.queueList}>
                    {discoveredBluetoothDevices.map((dev) => {
                      const isSeznik = /seznik|925|9394/i.test(dev.name || '');
                      return (
                        <TouchableOpacity
                          key={dev.address}
                          style={styles.deviceItemCard}
                          onPress={() => handleSelectBtDevice(dev)}
                        >
                          <View style={styles.deviceItemHeader}>
                            <Text style={styles.deviceNameText}>{dev.name || 'Unnamed Bluetooth Device'}</Text>
                            <Text style={{ color: '#f97316', fontSize: 12, fontWeight: '700' }}>Select →</Text>
                          </View>
                          <Text style={styles.deviceAddressText}>{dev.address}</Text>
                          <View style={styles.deviceBadgeRow}>
                            <View style={dev.transportType === 'ble_gatt' ? styles.bleBadge : styles.sppBadge}>
                              <Text style={dev.transportType === 'ble_gatt' ? styles.bleBadgeText : styles.sppBadgeText}>
                                {dev.transportType === 'ble_gatt' ? 'BLE (GATT)' : 'CLASSIC (SPP)'}
                              </Text>
                            </View>
                            {isSeznik && (
                              <View style={styles.thermal58Badge}>
                                <Text style={styles.thermal58BadgeText}>58MM SEZNIK</Text>
                              </View>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            )}

            {/* STEP: ANDROID USB SELECT */}
            {wizardStep === 'android_usb_select' && (
              <View style={styles.wizardBody}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={[styles.stepTitle, { flex: 1, marginBottom: 0 }]}>
                    Attached USB Printers:
                  </Text>
                  <TouchableOpacity
                    style={[styles.smallRefreshBtn, isWizardLoading && { opacity: 0.6 }]}
                    onPress={handleStartUsbAndroid}
                    disabled={isWizardLoading}
                  >
                    <Text style={styles.smallRefreshBtnText}>⟳ Detect</Text>
                  </TouchableOpacity>
                </View>

                {isWizardLoading ? (
                  <View style={{ padding: 24, alignItems: 'center', gap: 12 }}>
                    <ActivityIndicator color="#f97316" size="large" />
                    <Text style={{ color: '#a1a1aa', fontSize: 13 }}>Detecting USB printers...</Text>
                  </View>
                ) : discoveredUsbDevices.length === 0 ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={styles.emptyQueueText}>
                      No USB thermal printers detected. Connect printer via USB OTG cable and power it ON.
                    </Text>
                    <TouchableOpacity
                      style={[styles.primaryActionBtn, { marginTop: 12, paddingHorizontal: 20 }]}
                      onPress={handleStartUsbAndroid}
                    >
                      <Text style={styles.primaryActionBtnText}>Retry Detection</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <ScrollView style={styles.queueList}>
                    {discoveredUsbDevices.map((dev) => (
                      <TouchableOpacity
                        key={`${dev.vendorId}_${dev.productId}_${dev.deviceId}`}
                        style={styles.deviceItemCard}
                        onPress={() => handleSelectUsbDevice(dev)}
                      >
                        <View style={styles.deviceItemHeader}>
                          <Text style={styles.deviceNameText}>
                            {dev.deviceName || `USB Thermal Printer (${dev.vendorId}:${dev.productId})`}
                          </Text>
                          <Text style={{ color: '#f97316', fontSize: 12, fontWeight: '700' }}>Select →</Text>
                        </View>
                        <Text style={styles.deviceAddressText}>
                          VID: 0x{dev.vendorId.toString(16).toUpperCase()} | PID: 0x{dev.productId.toString(16).toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            {/* STEP: ANDROID NETWORK INPUT */}
            {wizardStep === 'android_network_input' && (
              <View style={styles.wizardBody}>
                <Text style={styles.stepTitle}>Network Thermal Printer (LAN / Wi-Fi):</Text>
                <Text style={styles.stepDesc}>
                  Enter the IP address of your ESC/POS network thermal printer:
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Printer IP Address:</Text>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="e.g. 192.168.1.100"
                    placeholderTextColor="#71717a"
                    keyboardType="numbers-and-punctuation"
                    value={ipAddressInput}
                    onChangeText={setIpAddressInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Port (Default: 9100):</Text>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="9100"
                    placeholderTextColor="#71717a"
                    keyboardType="number-pad"
                    value={portInput}
                    onChangeText={setPortInput}
                  />
                </View>

                <TouchableOpacity
                  style={styles.primaryActionBtn}
                  onPress={handleConfirmNetwork}
                >
                  <Text style={styles.primaryActionBtnText}>Continue to Configuration →</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* STEP: PAIR RESTROZ PRINT AGENT */}
            {wizardStep === 'windows_agent_pair' && (
              <View style={styles.wizardBody}>
                <Text style={styles.stepTitle}>Pair RestroZ Print Agent:</Text>
                <Text style={styles.stepDesc}>
                  1. Launch "RestroZ-Print-Agent-Setup.exe" on your Windows PC.
                  {'\n'}2. Enter or auto-detect the 6-digit Pairing Code displayed on the Print Agent:
                </Text>

                <View style={styles.inputGroup}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={[styles.inputLabel, { marginBottom: 0 }]}>Enter 6-Digit Pairing Code:</Text>
                    <TouchableOpacity
                      style={styles.autoDetectBtn}
                      onPress={handleAutoDetectAgentCode}
                      disabled={isDetectingAgent}
                    >
                      {isDetectingAgent ? (
                        <ActivityIndicator size="small" color="#f97316" />
                      ) : (
                        <Text style={styles.autoDetectBtnText}>⚡ Auto-Detect Code</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={styles.pairingInput}
                    placeholder="e.g. 482913"
                    placeholderTextColor="#71717a"
                    keyboardType="number-pad"
                    maxLength={6}
                    value={pairingCodeInput}
                    onChangeText={(val) => {
                      setPairingCodeInput(val);
                      if (!val) setDetectedAgentName(null);
                    }}
                  />
                  {detectedAgentName && pairingCodeInput ? (
                    <Text style={{ fontSize: 12, color: '#22c55e', marginTop: 5, fontWeight: '700' }}>
                      ⚡ Auto-detected from {detectedAgentName}
                    </Text>
                  ) : null}
                </View>

                <TouchableOpacity
                  style={[styles.primaryActionBtn, isPairingAgent && { opacity: 0.6 }]}
                  onPress={handlePairAgentSubmit}
                  disabled={isPairingAgent}
                >
                  {isPairingAgent ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.primaryActionBtnText}>Pair Print Agent</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* STEP: SELECT WINDOWS PRINTER QUEUE */}
            {wizardStep === 'windows_select' && (
              <View style={styles.wizardBody}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={[styles.stepTitle, { flex: 1, marginBottom: 0 }]}>
                    Select Installed Windows Queue on "{pairedAgent?.deviceName || 'Print Agent'}":
                  </Text>
                  <TouchableOpacity
                    style={[styles.smallRefreshBtn, isPollingQueues && { opacity: 0.6 }]}
                    onPress={() => pairedAgent && pollAgentQueues(pairedAgent.id)}
                    disabled={isPollingQueues}
                  >
                    <Text style={styles.smallRefreshBtnText}>⟳ Refresh</Text>
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={styles.searchInput}
                  placeholder="Filter printer queues (e.g. POS80, POS58)..."
                  placeholderTextColor="#71717a"
                  value={wizardSearchQuery}
                  onChangeText={setWizardSearchQuery}
                />

                {isPollingQueues ? (
                  <View style={{ padding: 24, alignItems: 'center', gap: 12 }}>
                    <ActivityIndicator color="#f97316" size="small" />
                    <Text style={{ color: '#a1a1aa', fontSize: 13 }}>Loading Windows printers...</Text>
                  </View>
                ) : (
                  <ScrollView style={styles.queueList}>
                    {availableQueues.length === 0 ? (
                      <Text style={styles.emptyQueueText}>
                        No matching printer queues found. Check Windows Devices & Printers or click Refresh.
                      </Text>
                    ) : (
                      availableQueues.map((q) => (
                        <TouchableOpacity
                          key={q}
                          style={[
                            styles.queueItem,
                            selectedWindowsPrinter === q && styles.queueItemSelected,
                          ]}
                          onPress={() => handleSelectWindowsQueue(q)}
                        >
                          <Text style={styles.queueItemName}>{q}</Text>
                          <Text style={styles.queueItemBadge}>● READY</Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>
                )}
              </View>
            )}

            {/* STEP: CONFIGURE & TEST */}
            {wizardStep === 'configure_test' && pendingPrinter && (
              <ScrollView style={styles.wizardBody}>
                <Text style={styles.stepTitle}>Printer: {pendingPrinter.name}</Text>

                {/* Role Selection */}
                <View style={styles.configSection}>
                  <Text style={styles.configLabel}>Printer Role:</Text>
                  <View style={styles.segmentedRow}>
                    {(['both', 'kot', 'bill'] as DirectPrinterRole[]).map((r) => (
                      <TouchableOpacity
                        key={r}
                        style={[styles.segmentBtn, wizardRole === r && styles.segmentBtnActive]}
                        onPress={() => setWizardRole(r)}
                      >
                        <Text style={[styles.segmentBtnText, wizardRole === r && styles.segmentBtnTextActive]}>
                          {r === 'both' ? 'KOT + BILL' : r.toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Paper Width */}
                <View style={styles.configSection}>
                  <Text style={styles.configLabel}>Paper Width:</Text>
                  <View style={styles.segmentedRow}>
                    {(['80mm', '58mm'] as DirectPaperWidth[]).map((w) => (
                      <TouchableOpacity
                        key={w}
                        style={[styles.segmentBtn, wizardPaperWidth === w && styles.segmentBtnActive]}
                        onPress={() => setWizardPaperWidth(w)}
                      >
                        <Text style={[styles.segmentBtnText, wizardPaperWidth === w && styles.segmentBtnTextActive]}>
                          {w}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Primary Toggle */}
                <View style={styles.toggleRow}>
                  <Text style={styles.configLabel}>Set as Primary Printer</Text>
                  <TouchableOpacity
                    style={[styles.switchTrack, wizardIsPrimary && styles.switchTrackOn]}
                    onPress={() => setWizardIsPrimary(!wizardIsPrimary)}
                  >
                    <View style={[styles.switchThumb, wizardIsPrimary && styles.switchThumbOn]} />
                  </TouchableOpacity>
                </View>

                {/* Test Print Button */}
                <TouchableOpacity
                  style={styles.testPrintActionBtn}
                  onPress={handleWizardTestPrint}
                  disabled={isWizardLoading}
                >
                  {isWizardLoading ? (
                    <ActivityIndicator color="#22c55e" size="small" />
                  ) : (
                    <Text style={styles.testPrintActionBtnText}>Send Test Print</Text>
                  )}
                </TouchableOpacity>

                {/* Finish Button */}
                <TouchableOpacity
                  style={styles.primaryActionBtn}
                  onPress={handleFinishWizard}
                >
                  <Text style={styles.primaryActionBtnText}>Save & Activate Printer</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* EDIT CONFIGURATION MODAL */}
      {/* ========================================================================= */}
      <Modal visible={Boolean(editingPrinter)} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.wizardModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Configure Printer: {editingPrinter?.name}</Text>
              <TouchableOpacity onPress={() => setEditingPrinter(null)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.wizardBody}>
              {/* Role Selection */}
              <View style={styles.configSection}>
                <Text style={styles.configLabel}>Printer Role:</Text>
                <View style={styles.segmentedRow}>
                  {(['both', 'kot', 'bill'] as DirectPrinterRole[]).map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.segmentBtn, editRole === r && styles.segmentBtnActive]}
                      onPress={() => setEditRole(r)}
                    >
                      <Text style={[styles.segmentBtnText, editRole === r && styles.segmentBtnTextActive]}>
                        {r === 'both' ? 'KOT + BILL' : r.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Paper Width */}
              <View style={styles.configSection}>
                <Text style={styles.configLabel}>Paper Width:</Text>
                <View style={styles.segmentedRow}>
                  {(['80mm', '58mm'] as DirectPaperWidth[]).map((w) => (
                    <TouchableOpacity
                      key={w}
                      style={[styles.segmentBtn, editPaperWidth === w && styles.segmentBtnActive]}
                      onPress={() => setEditPaperWidth(w)}
                    >
                      <Text style={[styles.segmentBtnText, editPaperWidth === w && styles.segmentBtnTextActive]}>
                        {w}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Primary Toggle */}
              <View style={styles.toggleRow}>
                <Text style={styles.configLabel}>Set as Primary Printer</Text>
                <TouchableOpacity
                  style={[styles.switchTrack, editIsPrimary && styles.switchTrackOn]}
                  onPress={() => setEditIsPrimary(!editIsPrimary)}
                >
                  <View style={[styles.switchThumb, editIsPrimary && styles.switchThumbOn]} />
                </TouchableOpacity>
              </View>

              {/* Save Button */}
              <TouchableOpacity
                style={styles.primaryActionBtn}
                onPress={handleSaveEdit}
              >
                <Text style={styles.primaryActionBtnText}>Save Changes</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272a',
    marginTop: 16,
    width: '100%',
    minWidth: 0,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
    width: '100%',
    minWidth: 0,
  },
  headerTitleBox: {
    flex: 1,
    minWidth: 200,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 13,
    color: '#a1a1aa',
    marginTop: 2,
    lineHeight: 18,
  },
  addBtn: {
    backgroundColor: '#f97316',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    flexShrink: 0,
  },
  addBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' as any } : {}),
  },
  agentBanner: {
    backgroundColor: '#27272a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#22c55e',
    width: '100%',
    minWidth: 0,
  },
  agentInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    width: '100%',
    minWidth: 0,
  },
  agentLeftCol: {
    flex: 1,
    minWidth: 220,
  },
  agentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  agentName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  agentOnlineBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    flexShrink: 0,
  },
  agentOnlineText: {
    color: '#22c55e',
    fontSize: 11,
    fontWeight: '700',
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' as any } : {}),
  },
  agentOfflineBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    flexShrink: 0,
  },
  agentOfflineText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '700',
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' as any } : {}),
  },
  agentSub: {
    fontSize: 12,
    color: '#a1a1aa',
    marginTop: 4,
    lineHeight: 16,
    ...(Platform.OS === 'web' ? {
      wordBreak: 'break-word' as any,
      overflowWrap: 'anywhere' as any,
    } : {}),
  },
  agentActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    flexShrink: 0,
  },
  unpairBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    flexShrink: 0,
  },
  unpairBtnText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' as any } : {}),
  },
  smallRefreshBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#3f3f46',
    flexShrink: 0,
  },
  smallRefreshBtnText: {
    color: '#f97316',
    fontSize: 12,
    fontWeight: '600',
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' as any } : {}),
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    justifyContent: 'center',
  },
  loadingText: {
    color: '#a1a1aa',
    fontSize: 13,
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#27272a',
    borderRadius: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  emptyText: {
    fontSize: 13,
    color: '#a1a1aa',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 400,
  },
  printerList: {
    gap: 12,
    width: '100%',
    minWidth: 0,
  },
  printerCard: {
    backgroundColor: '#27272a',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#3f3f46',
    width: '100%',
    minWidth: 0,
  },
  printerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
    minWidth: 0,
  },
  printerInfoCol: {
    flex: 1,
    minWidth: 200,
  },
  printerStatusBox: {
    flexShrink: 0,
  },
  printerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  printerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  primaryBadge: {
    backgroundColor: '#f97316',
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' as any } : {}),
  },
  primaryWarningBadge: {
    backgroundColor: 'rgba(234, 179, 8, 0.2)',
    borderWidth: 1,
    borderColor: '#eab308',
    color: '#eab308',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' as any } : {}),
  },
  primaryOfflineBadge: {
    backgroundColor: 'rgba(161, 161, 170, 0.2)',
    borderWidth: 1,
    borderColor: '#a1a1aa',
    color: '#a1a1aa',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' as any } : {}),
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#a1a1aa',
  },
  transportBadgeBt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38bdf8',
  },
  transportBadgeUsb: {
    fontSize: 11,
    fontWeight: '700',
    color: '#a855f7',
  },
  transportBadgeSerial: {
    fontSize: 11,
    fontWeight: '700',
    color: '#facc15',
  },
  transportBadgeAgent: {
    fontSize: 11,
    fontWeight: '700',
    color: '#22c55e',
  },
  transportBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#a1a1aa',
  },
  badgeConnected: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeConnectedText: {
    color: '#22c55e',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeOffline: {
    backgroundColor: 'rgba(161, 161, 170, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeOfflineText: {
    color: '#a1a1aa',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeWarning: {
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeWarningText: {
    color: '#eab308',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeError: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeErrorText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '700',
  },
  statusMessage: {
    fontSize: 12,
    color: '#a1a1aa',
    marginTop: 6,
  },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#3f3f46',
    paddingTop: 10,
    alignItems: 'center',
    width: '100%',
  },
  cardBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testBtn: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  testBtnText: {
    color: '#22c55e',
    fontSize: 12,
    fontWeight: '600',
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' as any } : {}),
  },
  editBtn: {
    backgroundColor: '#3f3f46',
  },
  editBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' as any } : {}),
  },
  deleteBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  deleteBtnText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' as any } : {}),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  wizardModal: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: '#3f3f46',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { maxHeight: '90vh' as any, overflowY: 'auto' as any } : {}),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    fontSize: 16,
    color: '#a1a1aa',
  },
  noticeBox: {
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
    borderLeftWidth: 4,
    borderLeftColor: '#f97316',
    padding: 10,
    margin: 16,
    marginBottom: 0,
    borderRadius: 4,
  },
  noticeText: {
    color: '#f97316',
    fontSize: 12,
    fontWeight: '500',
  },
  wizardBody: {
    padding: 16,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 12,
  },
  stepDesc: {
    fontSize: 13,
    color: '#a1a1aa',
    lineHeight: 18,
    marginBottom: 14,
  },
  optionCard: {
    backgroundColor: '#27272a',
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  optionDesc: {
    fontSize: 12,
    color: '#a1a1aa',
    marginTop: 3,
  },
  wizardLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(24, 24, 27, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    gap: 10,
  },
  wizardLoadingText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 6,
  },
  autoDetectBtn: {
    backgroundColor: '#3f3f46',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  autoDetectBtnText: {
    color: '#fb923c',
    fontSize: 11,
    fontWeight: '700',
  },
  pairingInput: {
    backgroundColor: '#27272a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3f3f46',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 4,
    textAlign: 'center',
  },
  searchInput: {
    backgroundColor: '#27272a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3f3f46',
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#ffffff',
    fontSize: 13,
    marginBottom: 12,
  },
  queueList: {
    maxHeight: 220,
  },
  queueItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#27272a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  queueItemSelected: {
    borderColor: '#f97316',
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
  },
  queueItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  queueItemBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#22c55e',
  },
  emptyQueueText: {
    color: '#a1a1aa',
    fontSize: 13,
    textAlign: 'center',
    padding: 16,
  },
  configSection: {
    marginBottom: 16,
  },
  configLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 6,
  },
  segmentedRow: {
    flexDirection: 'row',
    backgroundColor: '#27272a',
    borderRadius: 8,
    padding: 3,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentBtnActive: {
    backgroundColor: '#f97316',
  },
  segmentBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#a1a1aa',
  },
  segmentBtnTextActive: {
    color: '#ffffff',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  switchTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3f3f46',
    padding: 2,
    justifyContent: 'center',
  },
  switchTrackOn: {
    backgroundColor: '#f97316',
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  switchThumbOn: {
    transform: [{ translateX: 20 }],
  },
  testPrintActionBtn: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: '#22c55e',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  testPrintActionBtnText: {
    color: '#22c55e',
    fontSize: 13,
    fontWeight: '700',
  },
  primaryActionBtn: {
    backgroundColor: '#f97316',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryActionBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  transportBadgeTcp: {
    fontSize: 11,
    fontWeight: '700',
    color: '#06b6d4',
  },
  deviceItemCard: {
    backgroundColor: '#27272a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  deviceItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deviceNameText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
  },
  deviceAddressText: {
    fontSize: 11,
    color: '#a1a1aa',
    marginTop: 3,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  deviceBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    marginTop: 6,
  },
  bleBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bleBadgeText: {
    color: '#3b82f6',
    fontSize: 10,
    fontWeight: '700',
  },
  sppBadge: {
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sppBadgeText: {
    color: '#eab308',
    fontSize: 10,
    fontWeight: '700',
  },
  thermal58Badge: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  thermal58BadgeText: {
    color: '#22c55e',
    fontSize: 10,
    fontWeight: '700',
  },
});
