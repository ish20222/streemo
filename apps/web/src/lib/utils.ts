import { customAlphabet } from "nanoid";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const generatePairingCode = customAlphabet(alphabet, 6);

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function isVideoMime(mime: string) {
  return mime.startsWith("video/");
}

export function isAudioMime(mime: string) {
  return mime.startsWith("audio/");
}
