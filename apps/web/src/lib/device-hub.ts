import { WebSocket } from "ws";
import { EventEmitter } from "events";

export type DeviceCommand =
  | { type: "queue_updated" }
  | { type: "command"; action: "pause" | "resume" | "skip_video" | "skip_music" | "reload" | "clear_cache" }
  | { type: "config"; audioSink?: string; videoEnabled?: boolean; musicEnabled?: boolean };

type DeviceConn = {
  ws: WebSocket;
  deviceId: string;
  connectedAt: Date;
};

class DeviceHub extends EventEmitter {
  private connections = new Map<string, DeviceConn>();

  connect(deviceId: string, ws: WebSocket) {
    const existing = this.connections.get(deviceId);
    if (existing && existing.ws !== ws) {
      try {
        existing.ws.close(1000, "replaced");
      } catch {
        /* ignore */
      }
    }
    this.connections.set(deviceId, { ws, deviceId, connectedAt: new Date() });
    this.emit("connect", deviceId);

    ws.on("close", () => {
      const cur = this.connections.get(deviceId);
      if (cur?.ws === ws) {
        this.connections.delete(deviceId);
        this.emit("disconnect", deviceId);
      }
    });
  }

  isOnline(deviceId: string) {
    const conn = this.connections.get(deviceId);
    return !!conn && conn.ws.readyState === WebSocket.OPEN;
  }

  onlineDeviceIds() {
    return [...this.connections.keys()].filter((id) => this.isOnline(id));
  }

  send(deviceId: string, message: DeviceCommand) {
    const conn = this.connections.get(deviceId);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) return false;
    conn.ws.send(JSON.stringify(message));
    return true;
  }

  broadcastToDevice(deviceId: string, message: DeviceCommand) {
    return this.send(deviceId, message);
  }

  notifyQueueUpdated(deviceId: string) {
    return this.send(deviceId, { type: "queue_updated" });
  }
}

const globalForHub = globalThis as unknown as { deviceHub?: DeviceHub };

export const deviceHub = globalForHub.deviceHub ?? new DeviceHub();
if (!globalForHub.deviceHub) globalForHub.deviceHub = deviceHub;
