import { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Platform } from 'react-native';
import * as Network from 'expo-network';
import * as Device from 'expo-device';
import TcpSocket from 'react-native-tcp-socket';

export default function Index() {
  const [ipAddress, setIpAddress] = useState<string>('Loading...');
  const [isServerRunning, setIsServerRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const serverRef = useRef<any>(null);
  const historyStore = useRef<any[]>([]); // In-memory store for history

  const addLog = (msg: string) => {
    setLogs(prev => [msg, ...prev].slice(0, 50));
  };

  useEffect(() => {
    async function getIp() {
      try {
        const ip = await Network.getIpAddressAsync();
        setIpAddress(ip);
      } catch (e) {
        setIpAddress('Unknown IP');
      }
    }
    getIp();

    return () => {
      stopServer();
    };
  }, []);

  const stopServer = () => {
    if (serverRef.current) {
      serverRef.current.close();
      serverRef.current = null;
      setIsServerRunning(false);
      addLog('Server stopped.');
    }
  };

  const startServer = () => {
    if (isServerRunning) return;

    try {
      const server = TcpSocket.createServer((socket) => {
        socket.on('data', (data) => {
          const request = data.toString();
          const lines = request.split('\r\n');
          const firstLine = lines[0] || '';
          const [method, path] = firstLine.split(' ');

          if (!method || !path) return;

          let responseBody = '';
          let contentType = 'application/json';

          if (path.startsWith('/health') && method === 'GET') {
            responseBody = JSON.stringify({ status: 'ok' });
          } else if (path.startsWith('/handshake') && method === 'GET') {
            responseBody = JSON.stringify({
              device_name: Device.deviceName || 'Companion App',
              os: Platform.OS,
            });
          } else if (path.startsWith('/history') && method === 'GET') {
            responseBody = JSON.stringify(historyStore.current);
          } else if (path.startsWith('/history') && method === 'POST') {
            // Very naive body extraction (assumes body is everything after \r\n\r\n)
            const bodyIdx = request.indexOf('\r\n\r\n');
            if (bodyIdx > -1) {
              const bodyStr = request.substring(bodyIdx + 4);
              try {
                const parsed = JSON.parse(bodyStr);
                if (Array.isArray(parsed)) {
                  historyStore.current = [...historyStore.current, ...parsed];
                  addLog(`Received ${parsed.length} history entries from extension.`);
                } else if (parsed && parsed.url) {
                  historyStore.current.push(parsed);
                  addLog(`Received 1 history entry: ${parsed.url}`);
                }
              } catch (e) {
                addLog('Error parsing POST body');
              }
            }
            responseBody = JSON.stringify({ success: true });
          } else {
            // Not found
            socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
            socket.destroy();
            return;
          }

          const response =
            'HTTP/1.1 200 OK\r\n' +
            'Content-Type: ' + contentType + '\r\n' +
            'Content-Length: ' + responseBody.length + '\r\n' +
            'Connection: close\r\n' +
            '\r\n' +
            responseBody;

          socket.write(response);
          socket.destroy();
        });

        socket.on('error', (error) => {
          addLog(`Socket error: ${error}`);
        });
      });

      server.on('error', (error) => {
        addLog(`Server error: ${error}`);
        setIsServerRunning(false);
      });

      server.on('close', () => {
        setIsServerRunning(false);
      });

      server.listen({ port: 19848, host: '0.0.0.0' }, () => {
        setIsServerRunning(true);
        addLog(`Server listening on port 19848`);
      });

      serverRef.current = server;
    } catch (e: any) {
      addLog(`Failed to start server: ${e.message}`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Habituator</Text>
      
      <View style={styles.card}>
        <Text style={styles.label}>Device IP Address:</Text>
        <Text style={styles.ip}>{ipAddress}</Text>
        <Text style={styles.port}>Port: 19848</Text>
      </View>

      <TouchableOpacity
        style={[styles.button, isServerRunning ? styles.buttonStop : styles.buttonStart]}
        onPress={isServerRunning ? stopServer : startServer}
      >
        <Text style={styles.buttonText}>
          {isServerRunning ? 'Stop Sync Server' : 'Start Sync Server'}
        </Text>
      </TouchableOpacity>

      <View style={styles.logsContainer}>
        <Text style={styles.logsTitle}>Server Logs</Text>
        <ScrollView style={styles.logsScroll}>
          {logs.map((log, i) => (
            <Text key={i} style={styles.logText}>{log}</Text>
          ))}
          {logs.length === 0 && (
            <Text style={styles.logText}>No logs yet.</Text>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 30,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 30,
  },
  label: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
  },
  ip: {
    color: '#4caf50',
    fontSize: 28,
    fontWeight: 'bold',
  },
  port: {
    color: '#aaa',
    fontSize: 16,
    marginTop: 8,
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 30,
  },
  buttonStart: {
    backgroundColor: '#3b82f6',
  },
  buttonStop: {
    backgroundColor: '#ef4444',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  logsContainer: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    padding: 15,
  },
  logsTitle: {
    color: '#888',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  logsScroll: {
    flex: 1,
  },
  logText: {
    color: '#d4d4d4',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    marginBottom: 4,
  },
});
