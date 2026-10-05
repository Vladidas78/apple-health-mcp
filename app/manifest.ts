import type { MetadataRoute } from "next";

// Web app manifest so the dashboard can be added to the phone's home screen.
// Served at /manifest.webmanifest (excluded from the login proxy).
// [ANNAHME] iOS keeps a separate cookie store for home-screen web apps: log in
// once inside the home-screen app, not in Safari.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Coach",
    short_name: "Coach",
    description: "Tägliches Trainings-Dashboard",
    start_url: "/",
    display: "standalone",
    background_color: "#f5efe6",
    theme_color: "#f5efe6",
    lang: "de",
  };
}
