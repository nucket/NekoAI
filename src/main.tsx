import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { PanelWindow } from './PanelWindow'
import { HouseWindow } from './HouseWindow'
import { IS_LINUX } from './utils/platform'
import './index.css'

// Route selection: the `panel` Tauri window loads the same bundle but with a
// hash like #context-menu — render a lightweight panel shell instead of App.
const route = window.location.hash.replace(/^#/, '')
const isPanel = route.length > 0 && route !== 'house'

// Linux-only ghost-frame workaround: on Linux the main + house windows are
// opaque (transparent: false via tauri.linux.conf.json) and rely on GTK
// shape masking to cut a magenta chroma-key fill. On Windows / macOS the
// windows are natively transparent — applying the magenta fill there would
// just paint a solid pink box, so the class is gated on IS_LINUX.
// The panel window stays transparent: true on every platform and must not
// get this fill or it would leak past the UI's rounded corners.
if (IS_LINUX && !isPanel) {
  document.body.classList.add('chroma-key')
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {route === 'house' ? <HouseWindow /> : isPanel ? <PanelWindow route={route} /> : <App />}
  </React.StrictMode>
)
