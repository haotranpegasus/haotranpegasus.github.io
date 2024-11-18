// Get references to DOM elements
const scanButton = document.getElementById('scanButton');
const devicesList = document.getElementById('devicesList');
const disconnectButton = document.getElementById('disconnectButton');
let connectedDevice = null;
let characteristic = null;

// Define the service and characteristic UUIDs
const MIDAS_SERVICE_UUID = '480b1ce0-92ab-485a-af98-80d6727becf1';
const MIDAS_CHARACTERISTIC_UUID = '480b1ce1-92ab-485a-af98-80d6727becf4';

// Initialize Plotly chart
const plotDiv = document.getElementById('plot');
const data = [{
    x: [],
    y: [],
    mode: 'lines',
    name: 'RSSI (dBm)',
    line: { color: 'rgba(255, 99, 132, 1)' }
}];

const layout = {
    title: 'Live RSSI Values',
    xaxis: {
        title: 'Time',
        type: 'date',
        range: [new Date(Date.now() - 60000), new Date()] // Last 60 seconds
    },
    yaxis: {
        title: 'RSSI (dBm)',
        range: [-100, 0]
    }
};

Plotly.newPlot(plotDiv, data, layout);

// Function to update the Plotly chart
function updatePlot(rssi) {
    const currentTime = new Date();

    Plotly.extendTraces(plotDiv, {
        x: [[currentTime]],
        y: [[rssi]]
    }, [0]);

    // Keep only the latest 60 data points (last 60 seconds)
    const updateTime = currentTime - 60000; // 60 seconds ago
    Plotly.relayout(plotDiv, {
        'xaxis.range[0]': new Date(updateTime),
        'xaxis.range[1]': currentTime
    });
}

// Function to handle device selection and display
function handleDevice(device) {
    const listItem = document.createElement('li');
    listItem.textContent = `Name: ${device.name || 'Unnamed'}, ID: ${device.id}`;
    listItem.addEventListener('click', () => {
        connectToDevice(device);
    });
    devicesList.appendChild(listItem);
}

// Function to start scanning for BLE devices with "MIDAS" in their name
async function scanForDevices() {
    try {
        devicesList.innerHTML = ''; // Clear previous list

        const options = {
            acceptAllDevices: false,
            filters: [{
                namePrefix: 'MIDAS'
            }],
            optionalServices: [MIDAS_SERVICE_UUID]
        };

        // Request device
        const device = await navigator.bluetooth.requestDevice(options);
        handleDevice(device);

    } catch (error) {
        if (error.name === 'NotFoundError') {
            console.warn('No device selected. Scan was cancelled.');
            alert('No device selected. Please initiate the scan again to connect to a MIDAS device.');
        } else {
            console.error('Error during Bluetooth scan:', error);
            alert('An error occurred during the Bluetooth scan. Please try again.');
        }
    }
}

// Function to connect to a selected device and start RSSI monitoring
async function connectToDevice(device) {
    scanButton.disabled = true;
    devicesList.innerHTML = '';
    try {
        connectedDevice = device;
        const server = await device.gatt.connect();
        console.log(`Connected to ${device.name}`);

        // Get the service
        const service = await server.getPrimaryService(MIDAS_SERVICE_UUID);
        console.log(`Subcribe to characteristic: ${MIDAS_CHARACTERISTIC_UUID}`)
        // Get the characteristic
        characteristic = await service.getCharacteristic(MIDAS_CHARACTERISTIC_UUID);

        // Start notifications if the characteristic supports it
        if (characteristic.properties.notify) {
            await characteristic.startNotifications();
            characteristic.addEventListener('characteristicvaluechanged', handleCharacteristicValueChanged);
        } else {
            console.warn('Characteristic does not support notifications.');
            alert('The selected device does not support notifications for the required characteristic.');
            scanButton.disabled = false;
            return;
        }

        // Enable the disconnect button
        disconnectButton.disabled = false;

    } catch (error) {
        console.error('Error connecting to device:', error);
        alert('An error occurred while connecting to the device. Please try again.');
        scanButton.disabled = false;
    }
}

// Function to handle incoming characteristic data
function handleCharacteristicValueChanged(event) {
    const value = event.target.value;
    const data = new Uint8Array(value.buffer);
    if (data.length < 14) {
        console.warn('Received data packet is smaller than expected.');
        return;
    }
    // Extract RSSI from the 13th byte (index 12)
    let rssi = data[12];
    // Convert RSSI to signed integer if necessary
    rssi = rssi > 127 ? rssi - 256 : rssi;
    // Update the Plotly chart with the RSSI value
    updatePlot(rssi);
}

// Function to disconnect from the device and stop RSSI monitoring
function disconnectDevice() {
    if (connectedDevice && connectedDevice.gatt.connected) {
        connectedDevice.gatt.disconnect();
        console.log(`Disconnected from ${connectedDevice.name}`);
    }
    connectedDevice = null;
    characteristic = null;
    scanButton.disabled = false;
    disconnectButton.disabled = true;
}

// Add event listeners to the scan and disconnect buttons
scanButton.addEventListener('click', scanForDevices);
disconnectButton.addEventListener('click', disconnectDevice);
