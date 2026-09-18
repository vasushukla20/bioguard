# BioGuard Studio

Run `npm start` from this folder or its parent `BioGuard_repo` folder. Node.js and npm are required. On the first launch, the launcher installs pinned Three.js and Chart.js packages; subsequent launches use the local copies. The app runs at http://127.0.0.1:4173 and opens the default browser on Windows. Stop with Ctrl+C. Set PORT to choose another port.

Features: live posture visualization, surface/X-ray/wireframe modes, drag-to-orbit and zoom, camera presets, auto rotation, joint inspection, force vectors, neutral standing reference, scenario selection and filters, profile storage, stress dashboard, session JSON export, report JSON export and browser print-to-PDF.

Profiles and the latest session are stored in this browser. The body is a schematic articulated model, not a scanned anatomical model. The original simplified physics formulas are retained; forces, stress indices and future projections are educational estimates, not clinically validated measurements or injury predictions. Activity duration affects projected exposure, not instantaneous force.

Cloud sign-in and database synchronization still require Supabase configuration. The local profile/simulation/report workflow works without an account. This launcher does not provision a cloud database.

Run `npm test` in this folder for the model checks. Browser checks also covered live slider changes, layer controls, reset, exports, report rendering and mobile tabs.
