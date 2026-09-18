# Shared contracts (optional)

API shapes used by the dashboard and documented for the Pi agent.

Device manifest (simplified):

```json
{
  "deviceId": "...",
  "videoEnabled": true,
  "musicEnabled": true,
  "audioSink": "analog",
  "videoQueue": [
    {
      "mediaId": "...",
      "filename": "ad.mp4",
      "checksum": "sha256...",
      "downloadUrl": "https://..."
    }
  ],
  "musicQueue": []
}
```
