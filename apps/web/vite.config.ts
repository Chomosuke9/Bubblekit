import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
    plugins: [
        tailwindcss(),
        react({
            babel: {
                plugins: ["babel-plugin-react-compiler"],
            },
        }),
        VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["vite.svg"],
            manifest: {
                name: "Bubblekit",
                short_name: "Bubblekit",
                description: "Chat UI for Bubblekit",
                start_url: "/",
                display: "standalone",
                theme_color: "#f8fafc",
                background_color: "#f8fafc",
                icons: [],
            },
            devOptions: {
                enabled: true,
            },
            strategies: "injectManifest",
            srcDir: "src",
            filename: "sw.js",
        }),
    ],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
});
