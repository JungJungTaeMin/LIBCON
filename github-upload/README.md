# LIBCON App

## External API Setup

Create `.env` with Kakao and Google API keys:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-env.ps1
```

Required values:

```env
KAKAO_REST_API_KEY=
KAKAO_JS_API_KEY=
LIBRARY_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:5173/api/auth/google/callback
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

The `.env` file must contain real issued values, not only the variable names.
Do not upload `.env` to GitHub.

## Supabase Setup

Run [docs/06-supabase-setup.sql](./docs/06-supabase-setup.sql) in the Supabase SQL editor.

Then fill these server-only values in `.env`:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

When Supabase is configured, the server loads app state from Supabase on startup and syncs changes back to the `app_state` table. Without these values, it falls back to local `.data/libcon-db.json`.

To edit local keys quickly, double-click:

```text
edit-env.bat
```

To check whether required keys are filled, double-click:

```text
check-env.bat
```

Register this web platform domain in Kakao Developers:

```text
http://localhost:5173
```

Register this authorized redirect URI in Google Cloud Console:

```text
http://localhost:5173/api/auth/google/callback
```

Create the Google OAuth client with application type `Web application`.
The copied `GOOGLE_CLIENT_ID` must end with:

```text
.apps.googleusercontent.com
```

## Run

Recommended:

```text
Double-click start-libcon.bat, then open http://localhost:5173/
```

Or with PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-app.ps1
```

Or run only the API server:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-server.ps1
```

Open:

```text
http://localhost:5173/
```

Keep the API server window open while testing Google login and library search.

If port `5173` is already used by another static server, the app server automatically tries:

```text
http://localhost:5174/
```

## Install As App

When opened at `http://localhost:5173/`, the app includes a web app manifest and service worker.

- Chrome/Edge: install from the address bar or browser menu.
- Android Chrome: use "Add to Home screen".
- iOS Safari: use Share -> Add to Home Screen.

## Deploy To Vercel

Import this repository in Vercel with the framework preset set to `Other`.
No build command or output directory is required.

Add these values in **Project Settings > Environment Variables** for Production
and Preview:

```text
KAKAO_REST_API_KEY
KAKAO_JS_API_KEY
LIBRARY_API_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
```

Set the production redirect URI to your deployed domain:

```text
https://YOUR-PROJECT.vercel.app/api/auth/google/callback
```

Register the same URI in Google Cloud Console. Register the Vercel origin in
Kakao Developers as a JavaScript SDK domain:

```text
https://YOUR-PROJECT.vercel.app
```

After changing Vercel environment variables, redeploy the project.

## Connection Flow

```text
app.js
  -> GET /api/auth/me
  -> GET /api/auth/google/start
  -> GET /api/config
  -> GET /api/libraries?lat={latitude}&lng={longitude}&radius=5000

server.js
  -> Google OAuth 2.0
  -> Kakao Local API
  -> normalized library JSON
```
