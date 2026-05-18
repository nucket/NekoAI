import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { PanelWindow } from './PanelWindow'
import { HouseWindow } from './HouseWindow'
import './index.css'

// Route selection: the `panel` Tauri window loads the same bundle but with a
// hash like #context-menu — render a lightweight panel shell instead of App.
const route = window.location.hash.replace(/^#/, '')
const isPanel = route.length > 0 && route !== 'house'

// Linux ghost-frame workaround: main + house windows are configured opaque
// (transparent: false in tauri.conf.json) to avoid the WebKitGTK additive
// blending bug, and rely on GTK shape masking to cut a magenta chroma-key
// fill. The panel window remains transparent: true and must not get this
// fill or it would leak past the UI's rounded corners.
if (!isPanel) {
  document.body.classList.add('chroma-key')
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {route === 'house' ? <HouseWindow /> : isPanel ? <PanelWindow route={route} /> : <App />}
  </React.StrictMode>
)
