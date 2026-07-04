# Hardware Simulation (Wokwi)

This directory contains the ESP32 hardware simulation and microcontroller logic for the IoT office monitoring system. It acts as the physical layer of the architecture, representing **Work Room 1**. 

Instead of physical hardware, this project uses [Wokwi](https://wokwi.com/) to simulate an ESP32 connected to 5 slide switches (inputs) and 5 LEDs (outputs). It connects to the virtual `Wokwi-GUEST` WiFi network to send real-time data to the centralized FastAPI backend.

## 🔗 Project URL
**Wokwi Live Simulation:** [Team Maqsad](https://wokwi.com/projects/468597680724521985)

## 📂 File Structure
* `diagram.json`: The physical layout and wiring of the ESP32, switches, LEDs, and resistors in the Wokwi environment.
* `sketch.ino`: The C++ logic that runs on the ESP32. It handles WiFi connection, device registration via `POST /entry`, and physical switch edge-detection to trigger `POST /toggle/{uuid}`.
* `libraries.txt`: Defines the external dependencies required by the Wokwi compiler (e.g., `ArduinoJson`).

## ⚙️ How It Works
1. **Boot & Register:** On startup, the ESP32 connects to WiFi and registers 5 devices (3 lights at 15W, 2 fans at 60W) to the backend API.
2. **Save UUIDs:** It parses the JSON response from the backend and saves the generated `UUID` for each device in memory.
3. **Monitor & Toggle:** The main loop monitors the 5 physical slide switches. When a switch is flipped, it toggles the local LED indicator and immediately sends an empty `POST` request to `/toggle/{uuid}` to update the single source of truth in the database.

---

## 🚀 How to Run the Simulation

To connect this simulation to your local backend, you need to expose your FastAPI service to the internet using a tunneling tool like [Localtunnel](https://theboroer.github.io/localtunnel-www/) or ngrok.

### Step 1: Start your backend and tunnel
1. Run your FastAPI backend locally (usually on port `8000`).
2. Start your tunnel:
   ```bash
   lt --port 8000
3. Copy the generated URL (e.g., https://thin-oranges-juggle.loca.lt).

### Step 2: Update the API Base URL
Open the sketch.ino file in this directory (or directly in your Wokwi project) and update the API_BASE_URL variable at the top of the file:
```cpp
// ⚠️ Update this to your active Localtunnel/ngrok URL
// Ensure there is NO trailing slash at the end!
const char* API_BASE_URL = "[https://your-localtunnel-url.loca.lt](https://your-localtunnel-url.loca.lt)";
```

### Step 3: Run in Wokwi
1. Go to your Wokwi project link.
2. Ensure ArduinoJson is added in the Wokwi Library Manager.
3. Click the Green Play Button to start the simulation.
4. Watch the Serial Monitor: You should see the ESP32 connect to WiFi, register the devices, and print "Registration complete. Monitoring switches...".

### Step 4: Interact
Click on the slide switches in the Wokwi diagram. You will see the corresponding LED turn on/off, and the Serial Monitor will confirm that the toggle request was successfully sent to your backend.

### ⚠️ Important Notes
- Localtunnel Bypass: The sketch.ino code automatically includes the Bypass-Tunnel-Reminder: true HTTP header. This prevents Localtunnel from serving its warning HTML page, ensuring the ESP32 receives raw JSON data.
- Debouncing: A small 200ms delay is included after every switch toggle to prevent rapid double-firing and keep the database clean.
