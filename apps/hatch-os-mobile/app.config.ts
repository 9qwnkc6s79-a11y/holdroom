import type { ConfigContext, ExpoConfig } from "expo/config";

const camera = "Hatch OS uses the camera so you can attach a photo to a message.";
const photos = "Hatch OS uses your photo library so you can attach a photo to a message.";
const microphone = "Hatch OS uses the microphone so you can dictate in the chat. Audio is transcribed on this iPhone.";
const speech = "Hatch OS uses speech recognition to type what you say. Recognition stays on this iPhone and is not sent to another company.";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Hatch OS",
  slug: "hatch-os",
  owner: "djkeene",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "hatchos",
  userInterfaceStyle: "dark",
  backgroundColor: "#09090B",
  ios: {
    bundleIdentifier: "ai.hatchsystems.os",
    buildNumber: "4",
    supportsTablet: false,
    infoPlist: {
      CFBundleDisplayName: "Hatch OS",
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription: camera,
      NSPhotoLibraryUsageDescription: photos,
      NSMicrophoneUsageDescription: microphone,
      NSSpeechRecognitionUsageDescription: speech,
    },
  },
  plugins: [
    "expo-router",
    "expo-font",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#09090B",
        image: "./assets/splash-icon.png",
        imageWidth: 180,
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: photos,
        cameraPermission: camera,
        microphonePermission: microphone,
      },
    ],
  ],
  experiments: {
    typedRoutes: false,
  },
  extra: {
    apiBase: process.env.EXPO_PUBLIC_HATCH_API_BASE || "https://hatch-os-beta.vercel.app",
    eas: {
      projectId: "fc74686d-5f9e-4fb9-9511-d8b89c1fe68d",
    },
  },
});
