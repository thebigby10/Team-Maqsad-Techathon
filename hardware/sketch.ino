#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

const char* ssid = "Wokwi-GUEST";
const char* password = "";

// Base URL for Localtunnel (Ensure no trailing slash)
const char* API_BASE_URL = "https://flat-mammals-smile.loca.lt";

// Expanded struct to hold all DB registration data and the returned UUID
struct OfficeDevice {
  String name;
  int switchPin;
  int ledPin;
  float powerUsage;
  String roomNumber;
  bool lastState;
  String uuid;
};

// Define the 5 devices for Work Room 1
const int NUM_DEVICES = 5;
OfficeDevice devices[NUM_DEVICES] = {
  {"Light 1", 13, 15, 15.0, "Work Room 1", false, ""},
  {"Light 2", 12, 2,  15.0, "Work Room 1", false, ""},
  {"Light 3", 14, 4,  15.0, "Work Room 1", false, ""},
  {"Fan 1",   27, 16, 60.0, "Work Room 1", false, ""},
  {"Fan 2",   26, 17, 60.0, "Work Room 1", false, ""}
};

void setup() {
  Serial.begin(115200);

  // 1. Initialize hardware pins
  for (int i = 0; i < NUM_DEVICES; i++) {
    pinMode(devices[i].switchPin, INPUT_PULLUP);
    pinMode(devices[i].ledPin, OUTPUT);

    bool isSwitchOn = (digitalRead(devices[i].switchPin) == LOW);
    digitalWrite(devices[i].ledPin, isSwitchOn ? HIGH : LOW);
    devices[i].lastState = isSwitchOn;
  }

  // 2. Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected to WiFi!");

  // 3. Register devices to get UUIDs
  Serial.println("Starting Device Registration...");
  for (int i = 0; i < NUM_DEVICES; i++) {
    registerDevice(i);
  }
  Serial.println("Registration complete. Monitoring switches...");
}

void loop() {
  // Check the state of all switches
  for (int i = 0; i < NUM_DEVICES; i++) {
    bool isSwitchOn = (digitalRead(devices[i].switchPin) == LOW);

    // If the physical switch is flipped
    if (isSwitchOn != devices[i].lastState) {
      Serial.println("=====================================");
      Serial.println(devices[i].name + " toggled physically.");

      // Update LED indicator immediately
      digitalWrite(devices[i].ledPin, isSwitchOn ? HIGH : LOW);

      devices[i].lastState = isSwitchOn;

      // Only send toggle if we successfully got a UUID during registration
      if (devices[i].uuid != "") {
        sendToggleRequest(devices[i].uuid);
      } else {
        Serial.println("Cannot toggle: No UUID found for this device.");
      }

      delay(200); // Debounce
    }
  }
  delay(50);
}

void registerDevice(int index) {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client;
    client.setInsecure();

    HTTPClient http;
    String url = String(API_BASE_URL) + "/entry";

    http.begin(client, url);
    http.addHeader("Bypass-Tunnel-Reminder", "true");
    http.addHeader("Content-Type", "application/json");

    // Create JSON payload matching your Pydantic schema
    JsonDocument doc;
    doc["name"] = devices[index].name;
    doc["pin"] = devices[index].switchPin;
    doc["power_usage"] = devices[index].powerUsage;
    doc["room_number"] = devices[index].roomNumber;

    String requestBody;
    serializeJson(doc, requestBody);

    Serial.println("Registering " + devices[index].name + "...");
    int httpResponseCode = http.POST(requestBody);

    if (httpResponseCode > 0) {
      String payload = http.getString();

      // Parse the response to extract the generated ID
      JsonDocument responseDoc;
      DeserializationError error = deserializeJson(responseDoc, payload);

      if (!error) {
        // Assuming your FastAPI response returns the ID in an "id" field.
        // Change "id" to "uuid" if your schema outputs it differently.
        devices[index].uuid = responseDoc["id"].as<String>();
        Serial.println("Success! UUID saved: " + devices[index].uuid);
      } else {
        Serial.println("Failed to parse /entry JSON response.");
      }
    } else {
      Serial.print("Registration failed. HTTP Error: ");
      Serial.println(httpResponseCode);
    }
    http.end();
  }
}

void sendToggleRequest(String deviceUuid) {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client;
    client.setInsecure();

    HTTPClient http;

    // Construct the POST endpoint URL using the UUID
    String url = String(API_BASE_URL) + "/toggle/" + deviceUuid;
    Serial.println("Sending POST " + url);

    http.begin(client, url);
    http.addHeader("Bypass-Tunnel-Reminder", "true");
    http.addHeader("Content-Type", "application/json");

    // Send empty POST request to trigger the flip
    int httpResponseCode = http.POST("");

    if (httpResponseCode > 0) {
      Serial.print("Toggle Success! Code: ");
      Serial.println(httpResponseCode);
    } else {
      Serial.print("Toggle Error. Code: ");
      Serial.println(httpResponseCode);
    }
    http.end();
  }
}
