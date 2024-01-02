import { useEffect, useRef, useState } from "react";

// Needing to do this as the typescript definitions for the Web Serial API are not yet complete
interface WebSerialPort extends SerialPort {
  cancelRequested: boolean;
}

type BaudRatesType =
  | 1200
  | 2400
  | 4800
  | 9600
  | 14400
  | 31250
  | 38400
  | 56000
  | 57600
  | 76800
  | 115200;

type DataBitsType = 7 | 8;

type StopBitsType = 1 | 2;

export type PortState = "closed" | "closing" | "open" | "opening";

interface WebSerialContext {
  initialized: boolean;
  ports: WebSerialPort[];
}

const webSerialContext: WebSerialContext = {
  initialized: false,
  ports: [],
};

/**
 *
 * @param {() => void} callback
 * @param {number} delay
 */
function useInterval(callback: () => void, delay: number) {
  useEffect(() => {
    const id = setInterval(callback, delay);
    return () => clearInterval(id);
  }, [callback, delay]);
}

/**
 *
 * @param {{
 *  onConnect?: (WebSerialPort) => undefined
 *  onDisconnect?: (WebSerialPort) => undefined
 *  onData: (Uint8Array) => undefined
 * }}
 * @returns
 */
export function useWebSerial({
  onConnect,
  onDisconnect,
  onData,
}: {
  onConnect?: (port: WebSerialPort) => void;
  onDisconnect?: (port: WebSerialPort) => void;
  onData: (data: string) => void;
}) {
  if (!navigator.serial) {
    throw new Error("WebSerial is not available");
  }

  const [hasTriedAutoconnect, setHasTriedAutoconnect] = useState(false);

  const [canUseSerial] = useState(() => "serial" in navigator);
  const portState = useRef<PortState>("closed");
  const portRef = useRef<WebSerialPort | null>(null);
  const [ports, setPorts] = useState<WebSerialPort[]>(webSerialContext.ports);
  const [isOpen, setIsOpen] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [baudRate, setBaudRate] = useState<BaudRatesType>(115200);
  const [bufferSize, setBufferSize] = useState(255);
  const [dataBits, setDataBits] = useState<DataBitsType>(8);
  const [stopBits, setStopBits] = useState<StopBitsType>(1);
  const [flowControl, setFlowControl] = useState<FlowControlType>("none");
  const [parity, setParity] = useState<ParityType>("none");
  const [dataTerminalReady, setDataTerminalReady] = useState(false);
  const [requestToSend, setRequestToSend] = useState(false);
  const [breakSignal, setBreak] = useState(false);
  const [clearToSend, setClearToSend] = useState(false);
  const [dataCarrierDetect, setDataCarrierDetect] = useState(false);
  const [dataSetReady, setDataSetReady] = useState(false);
  const [ringIndicator, setRingIndicator] = useState(false);

  useInterval(() => {
    const port = portRef.current;
    if (port?.readable) {
      port.getSignals().then((signals: any) => {
        if (signals.clearToSend !== clearToSend) {
          setClearToSend(signals.clearToSend);
        }
        if (signals.dataCarrierDetect !== dataCarrierDetect) {
          setDataCarrierDetect(signals.dataCarrierDetect);
        }
        if (signals.dataSetReady !== dataSetReady) {
          setDataSetReady(signals.dataSetReady);
        }
        if (signals.ringIndicator !== ringIndicator) {
          setRingIndicator(signals.ringIndicator);
        }
      });
    }
  }, 100);

  const _onConnect = () => {
    const port = portRef.current;
    if (onConnect && port) {
      onConnect(port);
    }
  };

  const _onDisconnect = () => {
    const port = portRef.current;
    if (onDisconnect && port) {
      onDisconnect(port);
    }
  };

  /**
   *
   * @param {SerialPortRequestOptions} [options]
   */
  const manualConnectToPort = async (options?: SerialPortRequestOptions) => {
    console.log("manualConnectToPort HIT");
    if (canUseSerial && portState.current === "closed") {
      portState.current = "opening";

      try {
        const port = await navigator.serial.requestPort(options);
        openPort(port as WebSerialPort);
        return true;
      } catch (error) {
        portState.current = "closed";
        console.error("User did not select port");
      }
    }
    return false;
  };

  const autoConnectToPort = async () => {
    console.log("autoConnectToPort HIT");
    if (canUseSerial && portState.current === "closed") {
      portState.current = "opening";
      const port = portRef.current;

      const availablePorts = await navigator.serial.getPorts();
      console.log(port, availablePorts);
      if (availablePorts.length) {
        const port = availablePorts[0];
        await openPort(port as WebSerialPort);
        return true;
      } else {
        portState.current = "closed";
      }
      setHasTriedAutoconnect(true);
    }
    return false;
  };

  /**
   *
   * @param {WebSerialPort} port
   */
  const portInfo = (port: WebSerialPort) => {
    const info = port.getInfo();
    if (info.usbVendorId && info.usbProductId) {
      return {
        usbVendorId: info.usbVendorId,
        usbProductId: info.usbProductId,
        usbId: `${info.usbVendorId
          .toString(16)
          .padStart(4, "0")}:${info.usbProductId
          .toString(16)
          .padStart(4, "0")}`,
      };
    }
    return null;
  };

  const openPort = async (newPort: WebSerialPort) => {
    if (!newPort) {
      throw new Error("useWebSerial: No port selected");
    }

    if (newPort.readable) {
      throw new Error("useWebSerial: Port already opened");
    }

    try {
      await newPort.open({
        baudRate,
        bufferSize,
        dataBits,
        flowControl,
        parity,
        stopBits,
      });
      portRef.current = newPort;
      portState.current = "open";
      setIsOpen(true);
    } catch (error) {
      portState.current = "closed";
      setIsOpen(false);
      console.error("Could not open port");
    }
  };

  const closePort = async () => {
    const port = portRef.current;
    if (!port) {
      throw new Error("useWebSerial: No port selected");
    }

    if (!port.readable) {
      throw new Error("useWebSerial: Port not opened");
    }

    if (port.readable.locked) {
      throw new Error("useWebSerial: Port is locked (stopReading first)");
    }

    await port.close();

    setIsOpen(false);
  };

  const startReading = async () => {
    const port = portRef.current;
    console.log("startReading", port);
    if (!port) {
      throw new Error("no port selected");
    }

    if (!port.readable) {
      throw new Error("port not opened");
    }

    setIsReading(true);
    port.cancelRequested = false;
    const reader = port.readable.getReader();

    let decoder = new TextDecoder();
    let completeString = "";

    try {
      do {
        await reader.read().then(({ done, value }) => {
          completeString += decoder.decode(value);
          if (done || completeString.endsWith("ch> ")) {
            onData(completeString);
            completeString = "";
            return;
          }
        });
      } while (!port.cancelRequested);
    } finally {
      reader.releaseLock();
    }
  };

  const stopReading = async () => {
    const port = portRef.current;
    if (!port) {
      throw new Error("no port selected");
    }

    if (!port.readable) {
      throw new Error("port not opened");
    }

    setIsReading(false);
    port.cancelRequested = true;
  };

  /**
   *
   * @param {string} message
   */
  const write = async (message: string) => {
    const port = portRef.current;
    const encoder = new TextEncoder();
    const data = encoder.encode(message + "\r\n");
    console.log(message);

    const writer = port?.writable?.getWriter();
    try {
      await writer?.write(data);
    } finally {
      writer?.releaseLock();
    }
  };

  useEffect(() => {
    navigator.serial.addEventListener("connect", _onConnect);
    navigator.serial.addEventListener("disconnect", _onDisconnect);
    return () => {
      navigator.serial.removeEventListener("connect", _onConnect);
      navigator.serial.removeEventListener("disconnect", _onDisconnect);
    };
  });

  useEffect(() => {
    if (webSerialContext.initialized) {
      return;
    }

    webSerialContext.initialized = true;

    navigator.serial.getPorts().then((ports) => {
      if (ports.length >= 1) {
        webSerialContext.ports = ports as WebSerialPort[];
        setPorts(ports as WebSerialPort[]);
        portRef.current = ports[0] as WebSerialPort;
      }
    });
  }, []);

  useEffect(() => {}, [
    baudRate,
    bufferSize,
    dataBits,
    stopBits,
    flowControl,
    parity,
  ]);

  useEffect(() => {
    const port = portRef.current;
    if (port && port.readable) {
      port.setSignals({
        break: breakSignal,
        dataTerminalReady,
        requestToSend,
      });
    }
  }, [portRef, dataTerminalReady, requestToSend, breakSignal]);

  // Tries to auto-connect to a port, if possible
  useEffect(() => {
    if (
      canUseSerial &&
      !hasTriedAutoconnect &&
      portState.current === "closed"
    ) {
      console.log("useEffect", portState);
      autoConnectToPort();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseSerial, hasTriedAutoconnect, portState]);

  return {
    ports,
    isOpen,
    isReading,
    canUseSerial,
    portState,
    hasTriedAutoconnect,
    portInfo,
    manualConnectToPort,
    openPort,
    closePort,
    startReading,
    stopReading,
    write,
    options: {
      baudRate,
      bufferSize,
      dataBits,
      stopBits,
      flowControl,
      parity,
      setBaudRate,
      setBufferSize,
      setDataBits,
      setStopBits,
      setFlowControl,
      setParity,
    },
    signals: {
      break: breakSignal,
      dataTerminalReady,
      requestToSend,
      clearToSend,
      dataCarrierDetect,
      dataSetReady,
      ringIndicator,
      setBreak,
      setDataTerminalReady,
      setRequestToSend,
    },
  };
}
