// Get references to DOM elements
const scanButton = document.getElementById('scanButton');
const disconnectButton = document.getElementById('disconnectButton');
const logButton = document.getElementById('logButton'); // Checkbox instead of button
const statusDiv = document.getElementById('status');
const deviceNameSpan = document.getElementById('deviceName');
const deviceVersionSpan = document.getElementById('deviceVersion');
let connectedDevice = null;
let characteristic = null;
let write_characteristic = null;
let isLogging = false;

// Define the service and characteristic UUIDs
const MIDAS_SERVICE_UUID = '480b1ce0-92ab-485a-af98-80d6727becf1';
const MIDAS_CHARACTERISTIC_UUID = '480b1ce1-92ab-485a-af98-80d6727becf4';
const MIDAS_WRITE_CHARACTERISTIC_UUID = '480b1ce1-92ab-485a-af98-80d6727becf5';

// Initialize Plotly chart with dark theme settings
const plotDiv = document.getElementById('plot');
const initialData = [
    {
        x: [],
        y: [],
        mode: 'lines',
        name: 'RSSI (dBm)',
        line: {color: '#bb86fc', shape: 'spline'}, // Smooth lines
    },
];

const initialLayout = {
    title: {
        text: 'Live RSSI Values',
        font: {color: '#ffffff', size: 20},
    },
    xaxis: {
        title: {
            text: 'Time',
            font: {color: '#ffffff', size: 16},
        },
        type: 'date',
        range: [new Date(Date.now() - 60000), new Date()], // Last 60 seconds
        color: '#ffffff',
        gridcolor: '#333333',
        zerolinecolor: '#ffffff',
    },
    yaxis: {
        title: {
            text: 'RSSI (dBm)',
            font: {color: '#ffffff', size: 16},
        },
        range: [-100, 0],
        color: '#ffffff',
        gridcolor: '#333333',
        zerolinecolor: '#ffffff',
    },
    plot_bgcolor: '#1e1e1e',
    paper_bgcolor: '#121212',
    font: {
        color: '#ffffff',
    },
    legend: {
        font: {color: '#ffffff'},
    },
};

// Responsive Plotly configuration
const config = {
    responsive: true,
    displayModeBar: false, // Hides the toolbar for a cleaner look
};

Plotly.newPlot(plotDiv, initialData, initialLayout, config);

// Function to initialize Plotly chart
function initializePlot() {
    const data = [
        {
            x: [],
            y: [],
            mode: 'lines',
            name: 'RSSI (dBm)',
            line: {color: '#bb86fc', shape: 'spline'}, // Smooth lines
        },
    ];
    Plotly.newPlot(plotDiv, data, initialLayout, config);
}

// Function to reset the Plotly chart using Plotly.react
function resetPlot() {
    const freshData = [
        {
            x: [],
            y: [],
            mode: 'lines',
            name: 'RSSI (dBm)',
            line: {color: '#bb86fc', shape: 'spline'}, // Smooth lines
        },
    ];

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

    Plotly.extendTraces(
        plotDiv,
        {
            x: [[currentTime]],
            y: [[rssi]],
        },
        [0],
    );

    // Update the x-axis range to show the last 60 seconds
    Plotly.relayout(plotDiv, {
        'xaxis.range[0]': new Date(currentTime.getTime() - 60000),
        'xaxis.range[1]': currentTime,
    });
}

// Initialize IndexedDB
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('RSSILogDB', 1);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('logs')) {
                db.createObjectStore('logs', {
                    keyPath: 'id',
                    autoIncrement: true,
                });
            }
        };
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

// Save log data to IndexedDB
async function saveLog(timestamp, rssi, actualTxPower) {
    try {
        const db = await openDatabase();
        const transaction = db.transaction('logs', 'readwrite');
        const store = transaction.objectStore('logs');
        store.add({timestamp, rssi, actualTxPower});
        transaction.oncomplete = () => console.log('Log saved.');
        transaction.onerror = (event) =>
            console.error('Error saving log:', event.target.error);
    } catch (error) {
        console.error('Failed to save log:', error);
        updateStatus('Error saving log data.', true);
    }
}

// Retrieve all logs and export as CSV
async function exportLogs() {
    try {
        const db = await openDatabase();
        const transaction = db.transaction('logs', 'readonly');
        const store = transaction.objectStore('logs');
        const logs = [];

        return new Promise((resolve, reject) => {
            const request = store.openCursor();
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    logs.push(cursor.value);
                    cursor.continue();
                } else {
                    // All logs retrieved, now convert to CSV
                    let csvContent =
                        'Timestamp,RSSI (dBm),Actual TX Power (dBm)\n';
                    logs.forEach((log) => {
                        csvContent += `${new Date(
                            log.timestamp,
                        ).toISOString()},${log.rssi},${log.actualTxPower}\n`;
                    });
                    resolve(csvContent);
                }
            };
            request.onerror = (event) => reject(event.target.error);
        });
    } catch (error) {
        console.error('Failed to export logs:', error);
        updateStatus('Error exporting log data.', true);
    }
}

async function downloadLogsAsCSV() {
    try {
        updateStatus('Stage 1: Starting log export', false);

        // Get the CSV content
        const csvContent = await exportLogs();
        updateStatus('Stage 2: Log export completed', false);

        // Create an HTML page with the CSV content
        const htmlContent = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>CSV Logs</title>
            </head>
            <body>
                <h1>CSV Logs</h1>
                <textarea style="width: 100%; height: 90vh;" readonly>${csvContent}</textarea>
            </body>
            </html>
        `;

        // Open the HTML page in a new tab
        const newWindow = window.open();
        if (newWindow) {
            newWindow.document.write(htmlContent);
            newWindow.document.close();
            updateStatus(
                'Stage 3: Logs opened in a new tab as an HTML page',
                false,
            );
        } else {
            throw new Error(
                'Failed to open a new tab. Check popup blocker settings.',
            );
        }
    } catch (error) {
        console.error('Error opening logs as HTML:', error);
        updateStatus('Error opening logs as an HTML page.', true);
    }
}

// Clear all logs from IndexedDB
async function clearLogs() {
    try {
        const db = await openDatabase();
        const transaction = db.transaction('logs', 'readwrite');
        const store = transaction.objectStore('logs');
        store.clear();
        transaction.oncomplete = () => console.log('All logs cleared.');
        transaction.onerror = (event) =>
            console.error('Error clearing logs:', event.target.error);
    } catch (error) {
        console.error('Failed to clear logs:', error);
        updateStatus('Error clearing log data.', true);
    }
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
            filters: [
                {
                    namePrefix: 'MIDAS',
                },
            ],
            optionalServices: [MIDAS_SERVICE_UUID],
        };

        // Request device
        const device = await navigator.bluetooth.requestDevice(options);
        handleDevice(device);
    } catch (error) {
        scanButton.disabled = false; // Re-enable scan button on error
        if (error.name === 'NotFoundError') {
            console.warn('No device selected. Scan was cancelled.');
            updateStatus('No device selected. Please scan again.', true);
            alert(
                'No device selected. Please initiate the scan again to connect to a MIDAS device.',
            );
        } else {
            console.error('Error during Bluetooth scan:', error);
            updateStatus(`Error during scan: ${error.message}`, true);
            alert(
                'An error occurred during the Bluetooth scan. Please try again.',
            );
        }
    }
}

// Function to extract Device Name and Version from the full device name
function extractDeviceInfo(fullName) {
    if (!fullName) {
        return {name: 'Unknown', version: 'Unknown'};
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
        const formattedVersion = versionParts
            .map((part) => {
                // Convert to integer to remove leading zeros, then back to string
                const num = parseInt(part, 10);
                return isNaN(num) ? part : num.toString();
            })
            .join('.');

        deviceVersion = formattedVersion;
    }

    return {name: deviceName, version: deviceVersion};
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

        const characteristics = await service.getCharacteristics();
        characteristics.forEach((characteristic, index) => {
            console.log(`\nCharacteristic ${index + 1}:`);
            console.log(`  UUID: ${characteristic.uuid}`);
            console.log(
                `  Properties: ${Object.keys(characteristic.properties)
                    .filter((prop) => characteristic.properties[prop])
                    .join(', ')}`,
            );
        });

        // Get the characteristic
        characteristic = await service.getCharacteristic(
            MIDAS_CHARACTERISTIC_UUID,
        );

        //Get the write characteristic
        write_characteristic = await service.getCharacteristic(
            MIDAS_WRITE_CHARACTERISTIC_UUID,
        );

        // Remove existing event listener to prevent duplication
        characteristic.removeEventListener(
            'characteristicvaluechanged',
            handleCharacteristicValueChanged,
        );

        // Start notifications if the characteristic supports it
        if (characteristic.properties.notify) {
            await characteristic.startNotifications();
            characteristic.addEventListener(
                'characteristicvaluechanged',
                handleCharacteristicValueChanged,
            );
            updateStatus('Receiving RSSI data...');
        } else {
            console.warn('Characteristic does not support notifications.');
            updateStatus(
                'Characteristic does not support notifications.',
                true,
            );
            alert(
                'The selected device does not support notifications for the required characteristic.',
            );
            disconnectButton.disabled = true;
            scanButton.disabled = false;
            return;
        }
        // Extract Device Name and Version
        const {name: deviceName, version: deviceVersion} = extractDeviceInfo(
            device.name,
        );
        // Set Device Name and Version in HTML
        deviceNameSpan.textContent = deviceName;
        deviceVersionSpan.textContent = deviceVersion;
        // Enable the disconnect button
        disconnectButton.disabled = false;
    } catch (error) {
        console.error('Error connecting to device:', error);
        updateStatus(`Error connecting to device: ${error.message}`, true);
        alert(
            'An error occurred while connecting to the device. Please try again.',
        );
        scanButton.disabled = false;
    }
}

// Function to handle incoming characteristic data
async function handleCharacteristicValueChanged(event) {
    const value = event.target.value;
    const data = new Uint8Array(value.buffer);

    if (data.length < 15) {
        console.warn('Received data packet is smaller than expected.');
        updateStatus('Received incomplete data packet.', true);
        return;
    }

    // Extract RSSI from the 13th byte (index 12)
    let rssi = data[12];

    let tx_power = data[14];
    tx_power = tx_power > 127 ? tx_power - 256 : tx_power;
    deviceActualTxPowerSpan.textContent = tx_power;

    // Convert RSSI to signed integer if necessary
    rssi = rssi > 127 ? rssi - 256 : rssi;

    const currentTime = new Date();

    if (isLogging) {
        saveLog(currentTime, rssi, tx_power);
    }

    // Update the Plotly chart with the RSSI value
    updatePlot(rssi);
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
}

// Function to handle logging toggle
async function handleLogToggle() {
    // if (logButton.checked) {
    //     // Start logging
    //     await startLogging();
    // } else {
    //     // Stop logging
    //     await stopLogging();
    // }
}

// Add event listeners to the scan, disconnect, and log checkbox
scanButton.addEventListener('click', scanForDevices);
disconnectButton.addEventListener('click', disconnectDevice);
logButton.addEventListener('change', handleLogToggle);

// Handle window resize to make Plotly chart responsive
window.addEventListener('resize', () => {
    Plotly.Plots.resize(plotDiv);
});

// Function to write a constant TX power value to the write_characteristic
async function setTxPower(value) {
    if (!write_characteristic) {
        updateStatus('No write_characteristic available for writing.', true);
        return;
    }

    try {
        // Convert the TX power value to a Uint8Array
        const txPowerValue = new Uint8Array([value]);
        // Write the value to the write_characteristic
        await write_characteristic.writeValue(txPowerValue);
    } catch (error) {
        console.error('Error writing TX Power:', error);
        updateStatus(`Error setting TX Power: ${error.message}`, true);
    }
}

const txPowersSelect = document.getElementById('txPowers');
const deviceSetTxPowerSpan = document.getElementById('deviceSetTxPower');
const deviceActualTxPowerSpan = document.getElementById('deviceActualTxPower');

txPowersSelect.addEventListener('change', function () {
    const selectedValue = this.value;
    const selectedText = this.options[this.selectedIndex].text;
    if (connectedDevice && connectedDevice.gatt.connected) {
        deviceSetTxPowerSpan.textContent = selectedText;
        setTxPower(selectedValue);
    }
});

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const testButton = document.getElementById('testButton');
testButton.addEventListener('click', async function () {
    isLogging = true;
    updateStatus('Start Logging');
    for (let i = 1; i > -1; i--) {
        if (connectedDevice && connectedDevice.gatt.connected) {
            setTxPower(i);
            deviceSetTxPowerSpan.textContent = `${i} dBm`;
            await sleep(1500); // Waits for 1000ms (1 second) before the next iteration
        } else {
            deviceSetTxPowerSpan.textContent = `N/A dBm`;
            break;
        }
    }
    isLogging = false;
    await downloadLogsAsCSV(); // Download the logs when logging stops
    await clearLogs(); // Clear logs after download (optional)
});
