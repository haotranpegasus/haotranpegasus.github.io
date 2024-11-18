// Check if the Web Bluetooth API is available
if (!navigator.bluetooth) {
    alert('Web Bluetooth API is not available in this browser. Please use a compatible browser.');
}

// Get references to DOM elements
const scanButton = document.getElementById('scanButton');
const devicesList = document.getElementById('devicesList');

// Function to handle device selection and display
function handleDevice(device) {
    const listItem = document.createElement('li');
    listItem.textContent = `Name: ${device.name || 'Unnamed'}, ID: ${device.id}`;
    devicesList.appendChild(listItem);
}

// Function to start scanning for BLE devices
async function scanForDevices() {
    try {
        const options = {
            // Optional: specify services to filter devices
            // filters: [{ services: ['battery_service'] }]
            acceptAllDevices: true,
            optionalServices: ['battery_service'] // Example optional service
        };

        const device = await navigator.bluetooth.requestDevice(options);
        handleDevice(device);

        // Optional: Connect to the device and interact with it
        // const server = await device.gatt.connect();
        // const service = await server.getPrimaryService('battery_service');
        // const characteristic = await service.getCharacteristic('battery_level');
        // const batteryLevel = await characteristic.readValue();
        // console.log(`Battery Level: ${batteryLevel.getUint8(0)}%`);
    } catch (error) {
        console.error('Error during Bluetooth scan:', error);
    }
}

// Add event listener to the scan button
scanButton.addEventListener('click', scanForDevices);
