import React from "react";
import ReactDOM from "react-dom/client";
import { setupDevMockIfNeeded } from "./devMock";
import { App } from "./App";
import "./styles.css";

setupDevMockIfNeeded();

const createRoot =
  (ReactDOM as unknown as { createRoot?: typeof ReactDOM.createRoot; default?: { createRoot: typeof ReactDOM.createRoot } }).createRoot ||
  (ReactDOM as unknown as { default?: { createRoot: typeof ReactDOM.createRoot } }).default?.createRoot;

createRoot!(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
