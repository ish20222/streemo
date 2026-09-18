import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { jwtVerify } from "jose";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function getDeviceSecret() {
  const secret = process.env.DEVICE_TOKEN_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error("DEVICE_TOKEN_SECRET is not set");
  return new TextEncoder().encode(secret);
}

async function verifyDeviceToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getDeviceSecret());
    if (payload.typ !== "device" || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

async function main() {
  await app.prepare();

  const { deviceHub } = await import("./src/lib/device-hub");
  const { connectMongo } = await import("./src/lib/db");
  const { Device } = await import("./src/lib/models");
  await connectMongo();
  console.log("> MongoDB connected (database: streemo)");

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    const { pathname, query } = parse(req.url || "", true);
    if (pathname !== "/ws/devices") {
      socket.destroy();
      return;
    }

    const token =
      (typeof query.token === "string" && query.token) ||
      (req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : null);

    if (!token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const deviceId = await verifyDeviceToken(token);
    if (!deviceId) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const device = await Device.findById(deviceId);
    if (!device || device.deviceToken !== token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, deviceId);
    });
  });

  wss.on("connection", async (ws: WebSocket, _req: unknown, deviceId: string) => {
    deviceHub.connect(deviceId, ws);
    await Device.findByIdAndUpdate(deviceId, {
      status: "online",
      lastSeenAt: new Date(),
    });

    ws.send(JSON.stringify({ type: "connected", deviceId }));

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === "heartbeat") {
          const update: Record<string, unknown> = {
            status: "online",
            lastSeenAt: new Date(),
          };
          if (msg.playback) {
            update.playbackState = {
              videoMediaId: msg.playback.videoMediaId ?? null,
              musicMediaId: msg.playback.musicMediaId ?? null,
              videoPositionSec: msg.playback.videoPositionSec ?? null,
              musicPositionSec: msg.playback.musicPositionSec ?? null,
              videoStatus: msg.playback.videoStatus ?? "idle",
              musicStatus: msg.playback.musicStatus ?? "idle",
              updatedAt: new Date(),
            };
          }
          await Device.findByIdAndUpdate(deviceId, { $set: update });
          ws.send(JSON.stringify({ type: "heartbeat_ack", ts: Date.now() }));
        } else if (msg.type === "error") {
          console.error(`[device ${deviceId}]`, msg.message);
        }
      } catch (err) {
        console.error("WS message error", err);
      }
    });

    ws.on("close", async () => {
      try {
        await Device.findByIdAndUpdate(deviceId, { status: "offline" });
      } catch {
        /* ignore */
      }
    });
  });

  server.listen(port, hostname, () => {
    console.log(`> Streemo ready on http://${hostname}:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
