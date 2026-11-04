import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
// Mchezo display/body fonts, self-hosted (free, $0, no network font fetch).
import "@fontsource-variable/unbounded";
import "@fontsource-variable/figtree";
createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
