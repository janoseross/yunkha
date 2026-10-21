# Yunkha

Yunkha is a React Native and Expo showcase app for real-time video monitoring on iOS and Android. One device acts as a **Camera** and another as a **Monitor**. They connect with a four-letter room code and stream video directly between devices using WebRTC.

## Capabilities

- Create a temporary room on the Camera and join it from a Monitor. A Monitor can leave and rejoin while the Camera keeps the same room.
- Switch between front and rear cameras, hide the local preview, and change between Low, Balanced, and High video quality while streaming.
- Watch the remote stream in fullscreen and quickly rejoin the most recently connected room.
- Keep the Camera screen awake during capture.

## Connectivity

A small Node.js WebSocket server hosted on Google Cloud exchanges connection information; video does not pass through it. Yunkha uses Google's public STUN server for direct peer-to-peer connections. Video has been tested between an Android phone on cellular data and an iPhone on Wi-Fi.

This showcase does not use TURN, so connections may fail on networks that prevent direct WebRTC traffic.

## Local development

1. Run `npm ci`.
2. Copy `.env.example` to `.env`. The example includes the default public signaling URL.
3. Install a development build on each device, then run `npx expo start`.
4. Open the app on both devices. Choose **Camera** on one and **Monitor** on the other.

WebRTC requires a development build; Expo Go does not include its native module.
