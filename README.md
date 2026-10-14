# Yunkha

Yunkha is a React Native / Expo WebRTC showcase app. Each device can act as a **Camera** or **Monitor**. Video streams directly between the devices over WebRTC.

A small Node.js WebSocket signaling server hosted on Google Cloud exchanges SDP offers, answers, and ICE candidates. Video does not pass through the signaling server. The app uses `stun:stun.l.google.com:19302` for NAT traversal.

Internet peer-to-peer video has been tested between an Android phone on cellular data and an iPhone on Wi-Fi, with ICE selecting an `srflx`-to-`srflx` connection. This showcase deployment does not use TURN to keep infrastructure lightweight and free or very low cost. Connections can fail on networks that prevent direct WebRTC NAT traversal.

## Local development

The native and web clients use the room-based signaling server.

1. Run `npm ci`.
2. Copy `.env.example` to `.env`. The example contains the default public signaling URL.
3. Install a development build on each device, then run `npx expo start` and open the app on both devices.
4. Choose **Camera** on one device and **Monitor** on the other.

WebRTC requires a development build; Expo Go does not include its native module.

## Room signaling milestone

The signaling server keeps rooms in memory. Room codes are four uppercase letters from `ABCDEFGHJKLMNPQRSTUVWXYZ`. A Camera sends `{ "type": "create-room" }` and receives `{ "type": "room-created", "code": "ABCD" }`. A Monitor sends `{ "type": "join-room", "code": "ABCD" }` and receives `{ "type": "room-joined", "code": "ABCD" }`. Either side can send `{ "type": "leave-room" }`. The existing `ready`, `waiting`, `peer-left`, and WebRTC call messages apply within that room. Room errors use `{ "type": "room-error", "reason": "..." }`; a Monitor receives `{ "type": "room-ended", "code": "ABCD" }` when its Camera leaves. The native Monitor remembers the last successfully joined code but joins only when Connect is tapped.

## Design system (Day 1)

The native design system lives in `src/design-system/`. `tokens.ts` separates primitive values from semantic roles such as `colors.surface`, `colors.textSecondary`, and `typography.heading`. The approved Lighter Forest Green palette uses background `#16211A`, surface `#223329`, elevated surface `#2B4133`, primary `#4F785B`, text `#F1F5F1`, and border `#415947`. It also defines a 4 px spacing scale, type sizes, radii, shadows, icon sizes, and touch targets. Semantic token paths can map to web CSS variables later (for example, `colors.surfaceElevated` → `--color-surface-elevated`). New UI should use these tokens instead of local visual constants.

Inter Regular, Medium, SemiBold, and Bold load before the app renders. `components.tsx` exports:

- `AppText`: `variant` (`display`, `heading`, `title`, `body`, `bodyMedium`, `label`, `caption`, `metadata`) and semantic `tone`.
- `Button`: `label`, `variant` (`primary`, `secondary`, `destructive`), optional Lucide `icon`, `loading`, `disabled`, and `fullWidth`.
- `IconButton`: Lucide `icon` and required `accessibilityLabel`, with `ghost` or `surface` styling.
- `Card`: standard or `elevated` surface.
- `AppTextInput`: `label`, optional `hint` or `error`, and standard React Native text input props.
- `StatusIndicator`: `status` (`connected`, `connecting`, `waiting`, `disconnected`, `error`) and optional label.

In a development build, open **Design System Showcase** from the initial role selection screen. The scrollable preview contains color swatches, token scales, and interactive component examples. Its entry and rendering are guarded by `__DEV__`, so it is unavailable in production. Home, Camera, and Monitor retain their existing layouts for the next redesign stages.
