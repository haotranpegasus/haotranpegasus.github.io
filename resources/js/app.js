// Get references to DOM elements
const scanButton = document.getElementById('scanButton');
const disconnectButton = document.getElementById('disconnectButton');
const logButton = document.getElementById('logButton'); // Checkbox instead of button
const statusDiv = document.getElementById('status');
const deviceNameSpan = document.getElementById('deviceName');
const deviceVersionSpan = document.getElementById('deviceVersion');
let connectedDevice = null;
let characteristic = null;

// Define the service and characteristic UUIDs
const MIDAS_SERVICE_UUID = '480b1ce0-92ab-485a-af98-80d6727becf1';
const MIDAS_CHARACTERISTIC_UUID = '480b1ce1-92ab-485a-af98-80d6727becf4';

// Initialize Plotly chart with dark theme settings
const plotDiv = document.getElementById('plot');
const initialData = [{
    x: [],
    y: [],
    mode: 'lines',
    name: 'RSSI (dBm)',
    line: { color: '#bb86fc', shape: 'spline' } // Smooth lines
}];

const initialLayout = {
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
    },
};

// Responsive Plotly configuration
const config = {
    responsive: true,
    displayModeBar: false // Hides the toolbar for a cleaner look
};

Plotly.newPlot(plotDiv, initialData, initialLayout, config);

// Initialize variables for logging
let fileHandle = null;
let writableStream = null;
let isLogging = false;

// Function to request file creation or selection
async function getFileHandle() {
    try {
        const options = {
            types: [{
                description: 'CSV Files',
                accept: {
                    'text/csv': ['.csv']
                }
            }],
            suggestedName: `LOG_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`,
            excludeAcceptAllOption: true,
            multiple: false
        };
        // Prompt user to create or overwrite a file
        const handle = await window.showSaveFilePicker(options);
        return handle;
    } catch (error) {
        console.error('File selection cancelled or failed:', error);
        updateStatus('File selection cancelled.', true);
        logButton.checked = false; // Uncheck the checkbox if file selection fails
        return null;
    }
}


// Function to initialize logging
async function startLogging() {
    if (!('showSaveFilePicker' in window)) {
        alert('File System Access API is not supported in this browser.');
        logButton.checked = false;
        return;
    }

    fileHandle = await getFileHandle();
    if (!fileHandle) return;

    try {
        writableStream = await fileHandle.createWritable();
        // Write CSV headers
        await writableStream.write('Timestamp,RSSI (dBm)\n');
        isLogging = true;
        updateStatus('Logging RSSI data...');
    } catch (error) {
        console.error('Error initializing writable stream:', error);
        updateStatus('Error initializing file for logging.', true);
        logButton.checked = false;
    }
}

// Function to stop logging
async function stopLogging() {
    if (writableStream) {
        try {
            await writableStream.close();
            updateStatus('Logging stopped and file saved.');
        } catch (error) {
            console.error('Error closing writable stream:', error);
            updateStatus('Error saving the log file.', true);
        }
    }
    isLogging = false;
    fileHandle = null;
    writableStream = null;
}

// Function to append data to the CSV file
async function appendToCSV(timestamp, rssi) {
    if (!writableStream) return;
    const line = `${timestamp.toISOString()},${rssi}\n`;
    try {
        await writableStream.write(line);
    } catch (error) {
        console.error('Error writing to CSV:', error);
        updateStatus('Error writing data to the log file.', true);
    }
}

// Function to initialize Plotly chart
function initializePlot() {
    const data = [{
        x: [],
        y: [],
        mode: 'lines',
        name: 'RSSI (dBm)',
        line: { color: '#bb86fc', shape: 'spline' } // Smooth lines
    }];
    Plotly.newPlot(plotDiv, data, initialLayout, config);
}

// Function to reset the Plotly chart using Plotly.react
function resetPlot() {
    const freshData = [{
        x: [],
        y: [],
        mode: 'lines',
        name: 'RSSI (dBm)',
        line: { color: '#bb86fc', shape: 'spline' } // Smooth lines
    }];
    
    Plotly.react(plotDiv, freshData, initialLayout, config)
        .then(() => {
            console.log('Plot successfully reset.');
        })
        .catch((error) => {
            console.error('Error resetting the plot:', error);
            updateStatus('Error resetting the plot.', true);
        });
}

// Function to update the Plotly chart
function updatePlot(rssi) {
    if (!plotDiv || !plotDiv.data || plotDiv.data.length === 0) {
        console.warn('Plotly plot is not initialized or has no traces.');
        return;
    }

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
    updateStatus(`Connect to ${device.name}`);
    connectToDevice(device);
}

// Function to start scanning for BLE devices with "MIDAS" in their name
async function scanForDevices() {
    try {
        updateStatus('Scanning for devices...');
        scanButton.disabled = true; // Disable scan button during scan

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
        scanButton.disabled = false; // Re-enable scan button on error
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

// Function to extract Device Name and Version from the full device name
function extractDeviceInfo(fullName) {
    if (!fullName) {
        return { name: 'Unknown', version: 'Unknown' };
    }

    const parts = fullName.split('_');

    // Extract Device Name (before the underscore)
    const deviceName = parts[0] || 'Unknown';

    // Extract and format Device Version (after the underscore)
    let deviceVersion = 'Unknown';
    if (parts.length > 1) {
        const rawVersion = parts[1];
        const versionParts = rawVersion.split('.');

        // Remove leading zeros from each part of the version
        const formattedVersion = versionParts.map(part => {
            // Convert to integer to remove leading zeros, then back to string
            const num = parseInt(part, 10);
            return isNaN(num) ? part : num.toString();
        }).join('.');

        deviceVersion = formattedVersion;
    }

    return { name: deviceName, version: deviceVersion };
}


// Function to connect to a selected device and start RSSI monitoring
async function connectToDevice(device) {
    disconnectButton.disabled = true; // Disable disconnect button until connected
    updateStatus('Connecting to device...');
    try {
        connectedDevice = device;
        console.log('Attempting to connect to GATT server...');
        const server = await device.gatt.connect();
        console.log(`Connected to ${device.name}`);
        updateStatus(`Connected to ${device.name}`);

        // Initialize Plotly chart
        initializePlot();

        // Get the service
        const service = await server.getPrimaryService(MIDAS_SERVICE_UUID);

        // Get the characteristic
        characteristic = await service.getCharacteristic(MIDAS_CHARACTERISTIC_UUID);

        // Remove existing event listener to prevent duplication
        characteristic.removeEventListener('characteristicvaluechanged', handleCharacteristicValueChanged);
        
        // Start notifications if the characteristic supports it
        if (characteristic.properties.notify) {
            await characteristic.startNotifications();
            characteristic.addEventListener('characteristicvaluechanged', handleCharacteristicValueChanged);
            updateStatus('Receiving RSSI data...');
        } else {
            console.warn('Characteristic does not support notifications.');
            updateStatus('Characteristic does not support notifications.', true);
            alert('The selected device does not support notifications for the required characteristic.');
            disconnectButton.disabled = true;
            scanButton.disabled = false;
            return;
        }
        // Extract Device Name and Version
        const { name: deviceName, version: deviceVersion } = extractDeviceInfo(device.name);
        // Set Device Name and Version in HTML
        deviceNameSpan.textContent = deviceName;
        deviceVersionSpan.textContent = deviceVersion;
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
async function handleCharacteristicValueChanged(event) {
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

    // Append to CSV if logging is active
    if (isLogging && writableStream) {
        await appendToCSV(currentTime, rssi);
    }

    // Update the Plotly chart with the RSSI value
    updatePlot(rssi);
    updateStatus(`RSSI: ${rssi} dBm`);
}

// Function to disconnect from the device and stop RSSI monitoring
async function disconnectDevice() {
    if (connectedDevice && connectedDevice.gatt.connected) {
        connectedDevice.gatt.disconnect();
        console.log(`Disconnected from ${connectedDevice.name}`);
        updateStatus(`Disconnected from ${connectedDevice.name}`);
        updateStatus(`Cleaning plot from ${connectedDevice.name}`);
        // Reset the Plotly plot
        resetPlot();
    }
    connectedDevice = null;
    characteristic = null;
    scanButton.disabled = false;
    disconnectButton.disabled = true;

    // If logging was active, stop logging
    if (isLogging) {
        await stopLogging();
        logButton.checked = false; // Uncheck the checkbox
    }
}

// Function to handle logging toggle
async function handleLogToggle() {
    if (logButton.checked) {
        // Start logging
        await startLogging();
    } else {
        // Stop logging
        await stopLogging();
    }
}

// Add event listeners to the scan, disconnect, and log checkbox
scanButton.addEventListener('click', scanForDevices);
disconnectButton.addEventListener('click', disconnectDevice);
logButton.addEventListener('change', handleLogToggle);

// Handle window resize to make Plotly chart responsive
window.addEventListener('resize', () => {
    Plotly.Plots.resize(plotDiv);
});
