// Get references to DOM elements
const scanButton = document.getElementById('scanButton');
const devicesList = document.getElementById('devicesList');
const disconnectButton = document.getElementById('disconnectButton');
const statusDiv = document.getElementById('status');
let connectedDevice = null;
let characteristic = null;

// Define the service and characteristic UUIDs
const MIDAS_SERVICE_UUID = '480b1ce0-92ab-485a-af98-80d6727becf1';
const MIDAS_CHARACTERISTIC_UUID = '480b1ce1-92ab-485a-af98-80d6727becf4';

// Initialize Plotly chart with dark theme settings
const plotDiv = document.getElementById('plot');
const data = [{
    x: [],
    y: [],
    mode: 'lines',
    name: 'RSSI (dBm)',
    line: { color: '#bb86fc' } // Light purple line color for contrast
}];

const layout = {
    title: {
        text: 'Live RSSI Values',
        font: { color: '#ffffff', size: 20 }
    },
    xaxis: {
        title: {
            text: 'Time',
            font: { color: '#ffffff', size: 16 }
        },
        type: 'date',
        range: [new Date(Date.now() - 60000), new Date()], // Last 60 seconds
        color: '#ffffff',
        gridcolor: '#333333',
        zerolinecolor: '#ffffff'
    },
    yaxis: {
        title: {
            text: 'RSSI (dBm)',
            font: { color: '#ffffff', size: 16 }
        },
        range: [-100, 0],
        color: '#ffffff',
        gridcolor: '#333333',
        zerolinecolor: '#ffffff'
    },
    plot_bgcolor: '#1e1e1e',
    paper_bgcolor: '#121212',
    font: {
        color: '#ffffff'
    },
    legend: {
        font: { color: '#ffffff' }
    }
};

// Responsive Plotly configuration
const config = {
    responsive: true,
    displayModeBar: false // Hides the toolbar for a cleaner look
};

Plotly.newPlot(plotDiv, data, layout, config);

// Function to update the Plotly chart
function updatePlot(rssi) {
    const currentTime = new Date();

    Plotly.extendTraces(plotDiv, {
        x: [[currentTime]],
        y: [[rssi]]
    }, [0]);

    // Update the x-axis range to show the last 60 seconds
    Plotly.relayout(plotDiv, {
        'xaxis.range[0]': new Date(currentTime.getTime() - 60000),
        'xaxis.range[1]': currentTime
    });
}

// Function to update status messages
function updateStatus(message, isError = false) {
    statusDiv.textContent = message;
    statusDiv.style.color = isError ? '#cf6679' : '#03dac6'; // Red for errors, Teal for info
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
        updateStatus('Scanning for devices...');
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
        updateStatus('Device found. Click on the device to connect.');

    } catch (error) {
        if (error.name === 'NotFoundError') {
            console.warn('No device selected. Scan was cancelled.');
            updateStatus('No device selected. Please scan again.', true);
            alert('No device selected. Please initiate the scan again to connect to a MIDAS device.');
        } else {
            console.error('Error during Bluetooth scan:', error);
            updateStatus(`Error during scan: ${error.message}`, true);
            alert('An error occurred during the Bluetooth scan. Please try again.');
        }
    }
}

// Function to connect to a selected device and start RSSI monitoring
async function connectToDevice(device) {
    scanButton.disabled = true;
    devicesList.innerHTML = '';
    updateStatus('Connecting to device...');
    try {
        connectedDevice = device;
        console.log('Attempting to connect to GATT server...');
        const server = await device.gatt.connect();
        console.log(`Connected to ${device.name}`);
        updateStatus(`Connected to ${device.name}`);

        // Get the service
        const service = await server.getPrimaryService(MIDAS_SERVICE_UUID);

        // Get the characteristic
        characteristic = await service.getCharacteristic(MIDAS_CHARACTERISTIC_UUID);

        // Start notifications if the characteristic supports it
        if (characteristic.properties.notify) {
            await characteristic.startNotifications();
            characteristic.addEventListener('characteristicvaluechanged', handleCharacteristicValueChanged);
            updateStatus('Receiving RSSI data...');
        } else {
            console.warn('Characteristic does not support notifications.');
            updateStatus('Characteristic does not support notifications.', true);
            alert('The selected device does not support notifications for the required characteristic.');
            scanButton.disabled = false;
            return;
        }

        // Enable the disconnect button
        disconnectButton.disabled = false;

    } catch (error) {
        console.error('Error connecting to device:', error);
        updateStatus(`Error connecting to device: ${error.message}`, true);
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
        updateStatus('Received incomplete data packet.', true);
        return;
    }

    // Extract RSSI from the 13th byte (index 12)
    let rssi = data[12];

    // Convert RSSI to signed integer if necessary
    rssi = rssi > 127 ? rssi - 256 : rssi;

    const currentTime = new Date();
    console.log(`Received RSSI: ${rssi} dBm at ${currentTime.toLocaleTimeString()}`);

    // Update the Plotly chart with the RSSI value
    updatePlot(rssi);
    updateStatus(`RSSI: ${rssi} dBm`);
}

// Function to disconnect from the device and stop RSSI monitoring
function disconnectDevice() {
    if (connectedDevice && connectedDevice.gatt.connected) {
        connectedDevice.gatt.disconnect();
        console.log(`Disconnected from ${connectedDevice.name}`);
        updateStatus(`Disconnected from ${connectedDevice.name}`);
    }
    connectedDevice = null;
    characteristic = null;
    scanButton.disabled = false;
    disconnectButton.disabled = true;
}

// Add event listeners to the scan and disconnect buttons
scanButton.addEventListener('click', scanForDevices);
disconnectButton.addEventListener('click', disconnectDevice);

// Handle window resize to make Plotly chart responsive
window.addEventListener('resize', () => {
    Plotly.Plots.resize(plotDiv);
});