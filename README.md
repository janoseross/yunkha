# Yunkha

Yunkha is a React Native / Expo WebRTC showcase app. Each device can act as a **Camera** or **Monitor**. Video streams directly between the devices over WebRTC.

A small Node.js WebSocket signaling server hosted on Google Cloud exchanges SDP offers, answers, and ICE candidates. Video does not pass through the signaling server. The app uses `stun:stun.l.google.com:19302` for NAT traversal.

Internet peer-to-peer video has been tested between an Android phone on cellular data and an iPhone on Wi-Fi, with ICE selecting an `srflx`-to-`srflx` connection. This showcase deployment does not use TURN to keep infrastructure lightweight and free or very low cost. Connections can fail on networks that prevent direct WebRTC NAT traversal.

## Local development

1. Run `npm ci`.
2. Copy `.env.example` to `.env`. The example contains the default public signaling URL.
3. Install a development build on each device, then run `npx expo start` and open the app on both devices.
4. Choose **Camera** on one device and **Monitor** on the other.

WebRTC requires a development build; Expo Go does not include its native module.
