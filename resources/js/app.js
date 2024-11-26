// Get references to DOM elements
const scanButton = document.getElementById('scanButton');
const disconnectButton = document.getElementById('disconnectButton');
const statusDiv = document.getElementById('status');
const deviceNameSpan = document.getElementById('deviceName');
const deviceVersionSpan = document.getElementById('deviceVersion');
const deviceRssi = document.getElementById('deviceRSSI');
const deviceStatus = document.getElementById('deviceStatus')

const txPowersSelect = document.getElementById('txPowers');
const deviceSetTxPowerSpan = document.getElementById('deviceSetTxPower');
const deviceActualTxPowerSpan = document.getElementById('deviceActualTxPower');
const testButton = document.getElementById('testButton');

let connectedDevice = null;
let characteristic = null;
let write_characteristic = null;
let isLogging = false;

const INFO = 0;
const CONNECT = 1;
const DISCONNECT = 2;
const TEST = 3;
const ERROR = 4;

// Define the service and characteristic UUIDs
const MIDAS_SERVICE_UUID = '480b1ce0-92ab-485a-af98-80d6727becf1';
const MIDAS_CHARACTERISTIC_UUID = '480b1ce1-92ab-485a-af98-80d6727becf4';
const MIDAS_WRITE_CHARACTERISTIC_UUID = '480b1ce1-92ab-485a-af98-80d6727becf5';

// Add event listeners to the scan, disconnect, and log checkbox
scanButton.addEventListener('click', scanForDevices);
disconnectButton.addEventListener('click', disconnectDevice);

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
            updateStatus('Error resetting the plot.', ERROR);
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
        updateStatus('Error saving log data.', ERROR);
    }
}

// Retrieve all logs and export as CSV
async function exportLogs(pointName) {
    try {
        const db = await openDatabase();
        const transaction = db.transaction('logs', 'readonly');
        const store = transaction.objectStore('logs');
        const logs = [];

        // Retrieve metadata (you can replace these with actual values from your application)
        const metadata = {
            deviceName:
                document.getElementById('deviceName').textContent ||
                'Unknown Device',
            deviceVersion:
                document.getElementById('deviceVersion').textContent ||
                'Unknown Version',
            point: pointName,
        };

        return new Promise((resolve, reject) => {
            const request = store.openCursor();
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    logs.push(cursor.value);
                    cursor.continue();
                } else {
                    // All logs retrieved, now construct the CSV content

                    // Add metadata to the top of the CSV
                    let csvContent = `Point:${metadata.point}\n`;
                    csvContent += `Device Name:${metadata.deviceName}\n`;
                    csvContent += `Device Version:${metadata.deviceVersion}\n`;

                    // Add headers for the log data
                    csvContent +=
                        'Timestamp,RSSI (dBm),Actual TX Power (dBm)\n';

                    // Add the log data
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
        updateStatus('Error exporting log data.', ERROR);
    }
}

async function downloadLogsAsCSV(pointName) {
    try {
        // Get the CSV content
        const csvContent = await exportLogs(pointName);
        // Display the data in a scrollable container
        displayData(csvContent);
        // Add copy button functionality
        createCopyButton(csvContent);
    } catch (error) {
        updateStatus('Error displaying data.', ERROR);
    }
}

// Function to display data in a scrollable container
function displayData(data) {
    const dataList = document.getElementById('dataList');
    dataList.innerHTML = ''; // Clear existing data

    const rows = data.split('\n');
    rows.forEach((row) => {
        const listItem = document.createElement('li');
        listItem.textContent = row;
        dataList.appendChild(listItem);
    });

    // Ensure the copy button is visible
    const copyButton = document.getElementById('copyButton');
    copyButton.style.display = 'inline-block';
}

// Function to create a copy button
function createCopyButton(data) {
    const copyButton = document.getElementById('copyButton');

    copyButton.onclick = () => {
        const textarea = document.createElement('textarea');
        textarea.value = data;
        document.body.appendChild(textarea);

        textarea.select();
        document.execCommand('copy');

        document.body.removeChild(textarea);

        alert('Data copied to clipboard!');
    };
}

// Function to clear displayed data and hide the copy button
function clearDisplay() {
    const dataList = document.getElementById('dataList');
    const copyButton = document.getElementById('copyButton');

    dataList.innerHTML = ''; // Clear the list content
    copyButton.style.display = 'none'; // Hide the copy button
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
function updateStatus(message, type = INFO) {
    deviceStatus.textContent = message;
    let informationColor = null
    
    switch(type) {
        case INFO:
            informationColor = '#FFFFFF'; // White
            break;
        case CONNECT:
            informationColor = '#28a745'; // Green
            break;
        case DISCONNECT:
            informationColor = '#dc3545'; // Red
            break;
        case TEST:
            informationColor = '#007bff'; // Blue
            break;
        case ERROR:
            informationColor = '#dc3545'; // Red
            break;
        default:
            informationColor = '#FFFFFF'; // White
            break;
    }
    deviceStatus.style.color = informationColor;
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
            updateStatus(`Error during scan: ${error.message}`, ERROR);
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
        updateStatus(`Connected to ${device.name}`,CONNECT);

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
        } else {
            console.warn('Characteristic does not support notifications.');
            updateStatus(
                'Characteristic does not support notifications.',
                ERROR,
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
        updateStatus(`Error connecting to device: ${error.message}`, ERROR);
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
        updateStatus('Received incomplete data packet.', ERROR);
        return;
    }

    // Extract RSSI from the 13th byte (index 12)
    let rssi = data[12];
    let tx_power = data[14];

    tx_power = tx_power > 127 ? tx_power - 256 : tx_power;
    rssi = rssi > 127 ? rssi - 256 : rssi;

    deviceActualTxPowerSpan.textContent = `${tx_power} dBm`;
    deviceRssi.textContent = `${rssi} dBm`;

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
        updateStatus(`Disconnected from ${connectedDevice.name}`);
        // Reset the Plotly plot
        resetPlot();
    }
    connectedDevice = null;
    characteristic = null;
    scanButton.disabled = false;
    disconnectButton.disabled = true;
}

// Handle window resize to make Plotly chart responsive
window.addEventListener('resize', () => {
    Plotly.Plots.resize(plotDiv);
});

// Function to write a constant TX power value to the write_characteristic
async function setTxPower(value,test=1) {
    if (!write_characteristic) {
        updateStatus('No write_characteristic available for writing.', ERROR);
        return;
    }

    try {
        // Convert the TX power value to a Uint8Array
        const txPowerValue = new Uint8Array([value,test]);
        // Write the value to the write_characteristic
        await write_characteristic.writeValue(txPowerValue);
    } catch (error) {
        updateStatus(`Error setting TX Power: ${error.message}`, ERROR);
    }
}

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

testButton.addEventListener('click', async function () {
    // Prompt the user for input
    const userInput = prompt('Please enter a text:');

    if (userInput !== null && userInput.trim() !== '') {
        isLogging = true;
        updateStatus('Testing',TEST);
        clearDisplay();

        // Loop from 20 to -13
        for (let i = 20; i >= -20; i--) {
            if (connectedDevice && connectedDevice.gatt.connected) {
                // Ensure setTxPower completes before proceeding
                await setTxPower(i,0);
                deviceSetTxPowerSpan.textContent = `${i} dBm`;
                // Delay before the next iteration
                await sleep(1500);
            } else {
                deviceSetTxPowerSpan.textContent = `N/A dBm`;
                break;
            }
        }
        if (connectedDevice && connectedDevice.gatt.connected) {
            await setTxPower(20);
            deviceSetTxPowerSpan.textContent = `${20} dBm`;
        }


        isLogging = false;

        // Download the logs when logging stops
        await downloadLogsAsCSV(userInput);
        updateStatus('Test Finished');
        // Clear logs after download (optional)
        await clearLogs();
    } else {
        alert('No input provided. Skipping test');
    }
});
