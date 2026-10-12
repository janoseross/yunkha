module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []),
    ...(process.env.YUNKHA_PREVIEW_CLEARTEXT === 'true'
      ? [['expo-build-properties', { android: { usesCleartextTraffic: true } }]]
      : []),
  ],
  extra: {
    ...config.extra,
    buildTimestamp: new Date().toISOString(),
  },
});
