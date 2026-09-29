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
import { RestaurantSettings } from '../types';
import {
  webDirectPrintService,
  ConfiguredDirectPrinter,
  DirectPrinterRole,
  DirectPaperWidth,
  PrintAgentInfo,
} from '../services/webDirectPrintService';
import { setLocalKotPrinter } from '../services/directPrintService';

interface Props {
  restaurantId: string;
  canManage: boolean;
  settings?: RestaurantSettings | null;
  showToast: (type: 'success' | 'error' | 'info', title: string, message: string) => void;
}

type WizardStep = 'choose_type' | 'bluetooth_pair' | 'usb_detect' | 'serial_detect' | 'windows_agent_pair' | 'windows_select' | 'configure_test';

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
      const list = await webDirectPrintService.restorePrinters(restaurantId);
      setPrinters(list);

      const agent = await webDirectPrintService.getPairedAgent(restaurantId);
      setPairedAgent(agent);
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
      }
    } finally {
      setIsWizardLoading(false);
    }
  };

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
    } catch (err: any) {
      showToast('error', 'Test Print Failed', err.message || 'Test print failed.');
      const updatedList = webDirectPrintService.getSavedPrinters(restaurantId);
      setPrinters(updatedList);
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
    const updated: ConfiguredDirectPrinter = {
      ...pendingPrinter,
      role: wizardRole,
      paperWidth: wizardPaperWidth,
      isPrimary: wizardIsPrimary,
    };
    webDirectPrintService.updatePrinter(updated, restaurantId);
    if (updated.transport === 'agent' && (wizardIsPrimary || updated.isPrimary)) {
      setLocalKotPrinter(updated.windowsQueueName || updated.name, restaurantId);
    }
    await loadPrintersAndAgent();
    setWizardVisible(false);
    showToast('success', 'Printer Setup Complete', `"${updated.name}" is now ready for POS printing.`);
  };

  // Card Action Handlers
  const handleCardTestPrint = async (printer: ConfiguredDirectPrinter) => {
    setTestingPrinterId(printer.id);
    try {
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
    } catch (err: any) {
      showToast('error', 'Test Print Failed', err.message || 'Failed to print test receipt.');
      const updatedList = webDirectPrintService.getSavedPrinters(restaurantId);
      setPrinters(updatedList);
    } finally {
      setTestingPrinterId(null);
    }
  };

  const handleDisconnect = async (printer: ConfiguredDirectPrinter) => {
    if (!canManage) return;
    try {
      await webDirectPrintService.disconnectPrinter(printer.id, restaurantId);
      const updatedList = webDirectPrintService.getSavedPrinters(restaurantId);
      setPrinters(updatedList);
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

  const handleSaveEdit = () => {
    if (!editingPrinter) return;
    const updated: ConfiguredDirectPrinter = {
      ...editingPrinter,
      role: editRole,
      paperWidth: editPaperWidth,
      isPrimary: editIsPrimary,
    };
    webDirectPrintService.updatePrinter(updated, restaurantId);
    if (updated.transport === 'agent' && (editIsPrimary || editingPrinter.isPrimary)) {
      setLocalKotPrinter(updated.windowsQueueName || updated.name, restaurantId);
    }
    setEditingPrinter(null);
    showToast('success', 'Printer Updated', `Configuration updated for "${updated.name}".`);
    loadPrintersAndAgent();
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
        return <Text style={styles.transportBadgeBt}>BLUETOOTH (BLE)</Text>;
      case 'usb':
        return <Text style={styles.transportBadgeUsb}>WEBUSB DIRECT</Text>;
      case 'serial':
        return <Text style={styles.transportBadgeSerial}>WEB SERIAL (COM)</Text>;
      case 'agent':
        return <Text style={styles.transportBadgeAgent}>RESTROZ PRINT AGENT</Text>;
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
        <View>
          <Text style={styles.title}>Printer Devices</Text>
          <Text style={styles.subtitle}>
            Connect thermal receipt printers via Web Bluetooth, WebUSB, Serial, or RestroZ Print Agent.
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
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
            Click "+ Connect Printer" above to pair a Bluetooth, USB, Serial, or Windows Print Agent thermal printer.
          </Text>
        </View>
      ) : (
        <View style={styles.printerList}>
          {printers.map((p) => (
            <View key={p.id} style={styles.printerCard}>
              <View style={styles.printerHeader}>
                <View style={{ flex: 1 }}>
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
                {getStatusBadge(p)}
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

                {isWizardLoading && (
                  <View style={styles.wizardLoadingOverlay}>
                    <ActivityIndicator color="#f97316" size="large" />
                    <Text style={styles.wizardLoadingText}>Connecting hardware...</Text>
                  </View>
                )}
              </View>
            )}

            {/* STEP: PAIR RESTROZ PRINT AGENT */}
            {wizardStep === 'windows_agent_pair' && (
              <View style={styles.wizardBody}>
                <Text style={styles.stepTitle}>Pair RestroZ Print Agent:</Text>
                <Text style={styles.stepDesc}>
                  1. Launch "RestroZ-Print-Agent-Setup.exe" on your Windows PC.
                  {'\n'}2. Enter the 6-digit Pairing Code displayed on the Print Agent below:
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Enter 6-Digit Pairing Code:</Text>
                  <TextInput
                    style={styles.pairingInput}
                    placeholder="e.g. 482913"
                    placeholderTextColor="#71717a"
                    keyboardType="number-pad"
                    maxLength={6}
                    value={pairingCodeInput}
                    onChangeText={setPairingCodeInput}
                  />
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
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
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
    maxWidth: 500,
  },
  addBtn: {
    backgroundColor: '#f97316',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  agentBanner: {
    backgroundColor: '#27272a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#22c55e',
  },
  agentInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  },
  agentOnlineText: {
    color: '#22c55e',
    fontSize: 11,
    fontWeight: '700',
  },
  agentOfflineBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  agentOfflineText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '700',
  },
  agentSub: {
    fontSize: 12,
    color: '#a1a1aa',
    marginTop: 4,
  },
  unpairBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  unpairBtnText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
  },
  smallRefreshBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#3f3f46',
  },
  smallRefreshBtnText: {
    color: '#f97316',
    fontSize: 12,
    fontWeight: '600',
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
  },
  printerCard: {
    backgroundColor: '#27272a',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  printerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  printerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    gap: 8,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#3f3f46',
    paddingTop: 10,
  },
  cardBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  testBtn: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  testBtnText: {
    color: '#22c55e',
    fontSize: 12,
    fontWeight: '600',
  },
  editBtn: {
    backgroundColor: '#3f3f46',
  },
  editBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  deleteBtnText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
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
});
