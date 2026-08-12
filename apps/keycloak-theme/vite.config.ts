import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { keycloakify } from "keycloakify/vite-plugin";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    keycloakify({
      accountThemeImplementation: "none",
      kcContextExclusionsFtl: `
                <@addToXKeycloakifyMessagesIfMessageKey str="loginAccountSubtitle" />
                <@addToXKeycloakifyMessagesIfMessageKey str="loginAccountTitle" />
                <@addToXKeycloakifyMessagesIfMessageKey str="registerSubtitle" />
                <@addToXKeycloakifyMessagesIfMessageKey str="registerTitle" />
            `,
    }),
  ],
});
