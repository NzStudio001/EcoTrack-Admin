// js/analytics.js

import { db, auth } from './firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

let reportsChartInstance = null;
let statusChartInstance = null;
let mapInstance = null;

// NEW: Stores the heatmap layer so we can clear it on filter change
let heatLayerInstance = null;

let allRawReports = []; 
let rawExportData = []; 
let rawExportWmoStats = {}; 

// ==========================================
// 1. EXPORT FUNCTIONS
// ==========================================
window.generatePDF = function() {
    const pdfBtn = document.getElementById("pdfBtn");
    pdfBtn.innerText = "Generating PDF...";
    
    const toolsCard = document.getElementById("exportToolsCard");
    toolsCard.style.display = "none";

    const element = document.getElementById("printableDashboard");

    const opt = {
        margin:       0.3,
        filename:     'EcoTrack_Analytics_Report.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true }, 
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
        toolsCard.style.display = "block";
        pdfBtn.innerText = "Export PDF";
    });
}

window.generateExcel = function() {
    if (rawExportData.length === 0) {
        alert("No data available to export!");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    
    csvContent += "--- WMO PERFORMANCE SUMMARY ---\n";
    csvContent += "WMO Name,Pending,In Progress,Completed,Total Assigned Reports\n";
    
    for (const [wmoName, stats] of Object.entries(rawExportWmoStats)) {
        csvContent += `"${wmoName}",${stats.pending},${stats.inProgress},${stats.completed},${stats.total}\n`;
    }

    csvContent += "\n\n"; 

    csvContent += "--- DETAILED REPORT DATA ---\n";
    csvContent += "Report ID,Waste Type,Assigned WMO,Status\n";

    rawExportData.forEach(row => {
        let rowStr = `"${row.id}","${row.type}","${row.wmo}","${row.status}"`;
        csvContent += rowStr + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "EcoTrack_Analytics_Export.csv"); 
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================
// 2. WAIT FOR SECURE AUTHENTICATION
// ==========================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        initMap(); 
        fetchFirebaseData();
    }
});

// ==========================================
// 3. FETCH DATA & ATTACH LISTENERS
// ==========================================
function fetchFirebaseData() {
    onSnapshot(collection(db, 'reports'), (snapshot) => {
        allRawReports = [];
        snapshot.forEach(doc => {
            allRawReports.push({ id: doc.id, ...doc.data() });
        });
        
        applyFiltersAndUpdateUI();
    });

    document.getElementById('timeFilter').addEventListener('change', applyFiltersAndUpdateUI);
    document.getElementById('presintFilter').addEventListener('change', applyFiltersAndUpdateUI);
}

// ==========================================
// 4. FILTER DATA & UPDATE DASHBOARD
// ==========================================
function applyFiltersAndUpdateUI() {
    const timeFilter = document.getElementById('timeFilter').value;
    const presintFilter = document.getElementById('presintFilter').value;
    const now = new Date();

    // -- A. Filter Data Array --
    const filteredReports = allRawReports.filter(report => {
        let isValidTime = true;
        if (timeFilter !== 'all' && report.timestamp) {
            const reportDate = report.timestamp.toDate ? report.timestamp.toDate() : new Date(report.timestamp);
            const diffTime = Math.abs(now - reportDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));

            if (timeFilter === '1day' && diffHours > 24) isValidTime = false;
            if (timeFilter === '1week' && diffDays > 7) isValidTime = false;
            if (timeFilter === '1month' && diffDays > 30) isValidTime = false;
            if (timeFilter === '1year' && diffDays > 365) isValidTime = false;
        }

        let isValidPresint = true;
        if (presintFilter !== 'all') {
            const address = (report.address || '').toLowerCase();
            const presintNumbers = presintFilter.split(','); 
            
            isValidPresint = presintNumbers.some(num => {
                const regex = new RegExp(`(?:presint|precinct)\\s*0*${num.trim()}\\b`, 'i');
                return regex.test(address);
            });
        }

        return isValidTime && isValidPresint;
    });

    // -- B. Process Filtered Data --
    let activeCount = 0;
    let completedCount = 0;
    let statusCounts = { pending: 0, inProgress: 0, resolved: 0, rejected: 0 };
    let dateCounts = {}; 
    
    // NEW: Array to hold heatmap coordinate data
    let heatData = [];
    
    rawExportData = []; 
    rawExportWmoStats = {}; 

    filteredReports.forEach(report => {
        
        let status = (report.status || 'Pending').toLowerCase();
        let displayStatus = 'Pending';

        if (status === 'done' || status === 'completed' || status === 'resolved') {
            displayStatus = 'Resolved';
            statusCounts.resolved++;
            completedCount++;
        } else if (status === 'in progress') {
            displayStatus = 'In Progress';
            statusCounts.inProgress++;
            activeCount++;
        } else if (status === 'rejected') {
            displayStatus = 'Rejected';
            statusCounts.rejected++;
        } else {
            statusCounts.pending++;
            activeCount++;
        }

        let wmoName = report.assigned_wmo_name || 'Unassigned';

        if (!rawExportWmoStats[wmoName]) {
            rawExportWmoStats[wmoName] = { pending: 0, inProgress: 0, completed: 0, total: 0 };
        }
        rawExportWmoStats[wmoName].total++;
        if (displayStatus === 'Pending') rawExportWmoStats[wmoName].pending++;
        if (displayStatus === 'In Progress') rawExportWmoStats[wmoName].inProgress++;
        if (displayStatus === 'Resolved') rawExportWmoStats[wmoName].completed++;

        if (report.timestamp) {
            const d = report.timestamp.toDate ? report.timestamp.toDate() : new Date(report.timestamp);
            const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            dateCounts[dateStr] = (dateCounts[dateStr] || 0) + 1;
        }

        rawExportData.push({
            id: report.report_id || report.id,
            type: report.type || 'Unknown',
            status: displayStatus,
            wmo: wmoName,
            lat: report.latitude || 'N/A',
            lng: report.longitude || 'N/A'
        });

        // Heatmap Prep: Extract [lat, lng, intensity]
        if (report.latitude && report.longitude) {
            // Give pending/active reports a higher heat intensity (1.0) vs resolved ones (0.5)
            let intensity = (displayStatus === 'Resolved') ? 0.5 : 1.0;
            heatData.push([parseFloat(report.latitude), parseFloat(report.longitude), intensity]);
        }
    });

    // -- C. Update UI Cards --
    document.getElementById('statTotalReports').innerText = filteredReports.length;
    document.getElementById('statActiveReports').innerText = activeCount;
    document.getElementById('statCompletedReports').innerText = completedCount;

    let totalReports = filteredReports.length;
    let completionRate = totalReports > 0 ? Math.round((completedCount / totalReports) * 100) : 0;
    document.getElementById('statCompletionRate').innerText = completionRate + "%";

    // -- D. Update Charts & Maps --
    updateStatusChart(statusCounts);
    updateReportsChart(dateCounts);
    updateMapHeatmap(heatData); // Call the new heatmap function
}


// ==========================================
// 5. CHART & MAP DRAWING FUNCTIONS 
// ==========================================
function updateStatusChart(counts) {
    const ctx = document.getElementById("statusChart");
    if (!ctx) return;

    if (statusChartInstance) {
        statusChartInstance.destroy();
    }

    statusChartInstance = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: ["Pending", "In Progress", "Resolved", "Rejected"],
            datasets: [{
                data: [counts.pending, counts.inProgress, counts.resolved, counts.rejected],
                backgroundColor: ["#eab308", "#3b82f6", "#0a7741", "#dc2626"]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function updateReportsChart(dateCounts) {
    const ctx = document.getElementById("reportsChart");
    if (!ctx) return;

    if (reportsChartInstance) {
        reportsChartInstance.destroy();
    }

    const sortedDates = Object.keys(dateCounts).sort((a, b) => new Date(a) - new Date(b));
    const sortedValues = sortedDates.map(date => dateCounts[date]);

    reportsChartInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels: sortedDates,
            datasets: [{
                label: "Reports Logged",
                data: sortedValues,
                borderColor: "#0a7741",
                backgroundColor: "rgba(10,119,65,.1)",
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function initMap() {
    mapInstance = L.map("map").setView([2.9264, 101.6964], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap"
    }).addTo(mapInstance);
}

// NEW FUNCTION: UPDATE MAP HEATMAP
function updateMapHeatmap(heatData) {
    if (!mapInstance) return;

    // 1. Remove the old heat layer if it exists
    if (heatLayerInstance) {
        mapInstance.removeLayer(heatLayerInstance);
    }

    // 2. Configure and add the new heat layer
    // Adjust 'radius' and 'blur' below to make the heatmap spots larger/smaller
    heatLayerInstance = L.heatLayer(heatData, {
        radius: 25,
        blur: 15,
        maxZoom: 12,
        gradient: {
            0.4: 'blue', 
            0.6: 'cyan', 
            0.7: 'lime', 
            0.8: 'yellow', 
            1.0: 'red'
        }
    }).addTo(mapInstance);
}