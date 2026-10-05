# VisionMate Expo Go app

This is the native Expo Go client. The existing `frontend/` remains the Vite browser client, and `backend/` remains the FastAPI service.

## Phone setup

1. Install Expo Go on the phone and connect the phone and computer to the same Wi-Fi.
2. Copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_API_BASE_URL` to `http://<computer-wifi-ip>:8000` (this workspace is currently set to `http://10.121.249.233:8000`).
3. Start the backend listening on all interfaces from the `backend/` folder:

   ```powershell
   $env:VISIONMATE_HOST = "0.0.0.0"
   ..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

   If Windows Firewall asks, allow Python on your private network. Check `http://<computer-wifi-ip>:8000/api/health` from the phone browser.
4. From this folder, run:

   ```powershell
   npm install
   $env:EXPO_PACKAGER_PROXY_URL = "http://<computer-wifi-ip>:8081"
   npx expo start --lan --go --port 8081
   ```

5. Scan the displayed QR from **Expo Go**. Use `npx expo start --tunnel` if your Wi-Fi blocks local device connections.

Expo Go uses Expo Camera, Location, and Speech modules. If the computer IP changes, update `.env.local` and the `EXPO_PACKAGER_PROXY_URL`, then restart Expo.
