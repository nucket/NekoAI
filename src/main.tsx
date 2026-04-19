import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { PanelWindow } from "./PanelWindow";
import "./index.css";

// Route selection: the `panel` Tauri window loads the same bundle but with a
// hash like #context-menu — render a lightweight panel shell instead of App.
const route = window.location.hash.replace(/^#/, "");
const isPanel = route.length > 0;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isPanel ? <PanelWindow route={route} /> : <App />}
  </React.StrictMode>
);
